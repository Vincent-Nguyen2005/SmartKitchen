import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../../../node_modules/.prisma/client-menu";
import { daysLeft, EXPIRING_WITHIN_DAYS, normalizeName, usableKho, vnDay, type KhoItem } from "../kho-suggest";
import { generateDishes, GeminiError, geminiConfig, type AiDish, type GeminiConfig, type KhoSnapshotItem } from "./gemini";
import type { FamilyHealth } from "../family-health";
import { contextHash, familyBrief, forFamily, type AiFamilyBrief } from "./family-ai";

export type AiStatus = "ready" | "generating" | "not_configured" | "empty_kho" | "error";
export type AiSuggestionsResult = { status: AiStatus; dishes: AiDish[]; generatedAt: string | null; limitReached: boolean };

/** Regenerate 2 minutes after the last Kho change seen, so several quick edits make one model call. */
export const DEBOUNCE_MS = 120_000;
/** At most 8 model calls per family per Vietnam day; past it the last result stays. */
export const DAILY_LIMIT = 8;
/** A due generation that finds another one still running waits this long and tries again. */
const BUSY_RETRY_MS = 5_000;

/**
 * What the model sees of the Kho: usable (not expired) items, sorted, with an "expiring within 3 days" flag. The same
 * Kho always gives the same snapshot (and hash). The family part (anonymous aggregates) comes from family-ai.ts.
 */
export function khoSnapshot(items: KhoItem[], today: string = vnDay()): KhoSnapshotItem[] {
  return usableKho(items, today)
    .map((item) => {
      const left = daysLeft(item.expiryDate, today);
      return {
        name: item.name.trim(),
        quantity: item.quantity !== null && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : null,
        unit: item.unit,
        expiringSoon: left !== null && left >= 0 && left <= EXPIRING_WITHIN_DAYS,
      };
    })
    .sort((left, right) => normalizeName(left.name).localeCompare(normalizeName(right.name)) || (left.unit ?? "").localeCompare(right.unit ?? ""));
}

export const snapshotHash = (snapshot: KhoSnapshotItem[]): string =>
  createHash("sha256").update(JSON.stringify(snapshot.map((item) => [normalizeName(item.name), item.quantity, item.unit, item.expiringSoon]))).digest("hex");

/**
 * AI cache key: the Kho snapshot hash plus, with family data, a hash of the members' allergies, conditions and targets,
 * so a profile change regenerates the dishes (same debounce and daily limit as a Kho change).
 */
export const suggestionHash = (snapshot: KhoSnapshotItem[], health?: FamilyHealth): string =>
  health && health.members.length > 0
    ? createHash("sha256").update(`${snapshotHash(snapshot)}:${contextHash(health)}`).digest("hex")
    : snapshotHash(snapshot);

type Timer = unknown;
export type EngineDeps = {
  client: PrismaClient;
  config?: () => GeminiConfig | null;
  generate?: (snapshot: KhoSnapshotItem[], config: GeminiConfig, idPrefix: string, brief?: AiFamilyBrief) => Promise<AiDish[]>;
  delayMs?: number;
  setTimer?: (run: () => void, ms: number) => Timer;
  clearTimer?: (timer: Timer) => void;
  now?: () => Date;
  logError?: (message: string) => void;
};

type StoredRow = { familyId: string; dishes: Prisma.JsonValue; khoHash: string; status: string; generatedAt: Date; generationDay: string; generationCount: number };

const dishesOf = (row: StoredRow | null): AiDish[] => (row && Array.isArray(row.dishes) ? row.dishes as unknown as AiDish[] : []);

/** Per-family AI suggestions: snapshot hash on read, debounced background generation, daily limit, stored result. */
export class AiSuggestionEngine {
  private readonly pending = new Map<string, { timer: Timer; hash: string; snapshot: KhoSnapshotItem[]; health?: FamilyHealth }>();
  private readonly running = new Set<string>();
  private readonly client: PrismaClient;
  private readonly config: () => GeminiConfig | null;
  private readonly generate: NonNullable<EngineDeps["generate"]>;
  private readonly delayMs: number;
  private readonly setTimer: NonNullable<EngineDeps["setTimer"]>;
  private readonly clearTimer: NonNullable<EngineDeps["clearTimer"]>;
  private readonly now: () => Date;
  private readonly logError: (message: string) => void;

  constructor(deps: EngineDeps) {
    this.client = deps.client;
    this.config = deps.config ?? (() => geminiConfig());
    this.generate = deps.generate ?? ((snapshot, config, idPrefix, brief) => generateDishes(snapshot, config, idPrefix, fetch, brief));
    this.delayMs = deps.delayMs ?? DEBOUNCE_MS;
    this.setTimer = deps.setTimer ?? ((run, ms) => { const timer = setTimeout(run, ms); timer.unref?.(); return timer; });
    this.clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    this.now = deps.now ?? (() => new Date());
    this.logError = deps.logError ?? ((message) => console.error(message));
  }

  isGenerating(familyId: string): boolean {
    return this.pending.has(familyId) || this.running.has(familyId);
  }

  private cancel(familyId: string): void {
    const entry = this.pending.get(familyId);
    if (entry) this.clearTimer(entry.timer);
    this.pending.delete(familyId);
  }

  /** (Re)starts the debounce for this family with the newest snapshot and family context. */
  private schedule(familyId: string, snapshot: KhoSnapshotItem[], hash: string, delay: number, health?: FamilyHealth): void {
    this.cancel(familyId);
    const timer = this.setTimer(() => { void this.fire(familyId); }, delay);
    this.pending.set(familyId, { timer, hash, snapshot, health });
  }

  private async fire(familyId: string): Promise<void> {
    const entry = this.pending.get(familyId);
    if (!entry) return;
    if (this.running.has(familyId)) {
      this.schedule(familyId, entry.snapshot, entry.hash, BUSY_RETRY_MS, entry.health);
      return;
    }
    this.pending.delete(familyId);
    await this.run(familyId, entry.snapshot, entry.hash, entry.health);
  }

  /** One generation: skipped when the hash is unchanged or the daily limit is reached; errors keep the old dishes. */
  async run(familyId: string, snapshot: KhoSnapshotItem[], hash: string, health?: FamilyHealth): Promise<void> {
    const config = this.config();
    if (!config) return;
    this.running.add(familyId);
    try {
      const row = await this.client.aiSuggestion.findUnique({ where: { familyId } }) as StoredRow | null;
      if (row && row.khoHash === hash) return;
      const day = vnDay(this.now());
      const used = row && row.generationDay === day ? row.generationCount : 0;
      if (used >= DAILY_LIMIT) return;
      const base = { khoHash: hash, generationDay: day, generationCount: used + 1 };
      try {
        // The model gets anonymous family aggregates; allergens are then dropped and warnings attached here.
        const dishes = forFamily(await this.generate(snapshot, config, `ai-${hash.slice(0, 10)}`, health ? familyBrief(health) : undefined), health);
        if (dishes.length === 0) throw new GeminiError("Model returned no valid dishes");
        const data = { ...base, dishes: dishes as unknown as Prisma.InputJsonValue, status: "ready", errorMessage: null, generatedAt: this.now() };
        await this.client.aiSuggestion.upsert({ where: { familyId }, create: { familyId, ...data }, update: data });
      } catch (error) {
        // Keep the previous dishes; the same Kho is not retried (the hash is stored), a Kho change tries again.
        const message = error instanceof GeminiError ? error.message : "AI suggestion failed";
        this.logError(`[menu-service] AI suggestions failed: ${message}`);
        const data = { ...base, dishes: dishesOf(row) as unknown as Prisma.InputJsonValue, status: "error", errorMessage: message };
        await this.client.aiSuggestion.upsert({ where: { familyId }, create: { familyId, ...data }, update: data });
      }
    } finally {
      this.running.delete(familyId);
    }
  }

  /**
   * Called on every read with the family's current Kho and health context. Same hash: stored result. Changed Kho or
   * family context: debounced regeneration (status generating, previous dishes still shown). Nothing stored yet:
   * start right away. Stored dishes are always re-checked against the current family (allergens dropped, warnings
   * recomputed), so a new allergy never shows an unsafe dish while the regeneration is pending.
   */
  async getSuggestions(familyId: string, khoItems: KhoItem[], health?: FamilyHealth): Promise<AiSuggestionsResult> {
    if (!this.config()) return { status: "not_configured", dishes: [], generatedAt: null, limitReached: false };
    const snapshot = khoSnapshot(khoItems, vnDay(this.now()));
    if (snapshot.length === 0) {
      this.cancel(familyId);
      return { status: "empty_kho", dishes: [], generatedAt: null, limitReached: false };
    }
    const hash = suggestionHash(snapshot, health);
    const row = await this.client.aiSuggestion.findUnique({ where: { familyId } }) as StoredRow | null;
    const result = (status: AiStatus, limitReached = false): AiSuggestionsResult => ({
      status, dishes: forFamily(dishesOf(row), health), generatedAt: row?.generatedAt.toISOString() ?? null, limitReached,
    });

    if (row && row.khoHash === hash) {
      // Kho is back to the stored state: a pending regeneration is no longer needed.
      if (this.pending.get(familyId)?.hash !== hash) this.cancel(familyId);
      return result(this.running.has(familyId) ? "generating" : row.status === "error" ? "error" : "ready");
    }
    if (!row) {
      if (!this.isGenerating(familyId)) this.schedule(familyId, snapshot, hash, 0, health);
      return result("generating");
    }
    const day = vnDay(this.now());
    if (row.generationDay === day && row.generationCount >= DAILY_LIMIT) {
      this.cancel(familyId);
      return result(row.status === "error" ? "error" : "ready", true);
    }
    if (this.pending.get(familyId)?.hash !== hash) this.schedule(familyId, snapshot, hash, this.delayMs, health);
    return result("generating");
  }
}
