/**
 * Auto-save for edit sheets (pure, no React Native; covered by autoSave.test.ts). Same idea as the Hồ sơ name field
 * (ProfileHeader): save after a short pause, show "Đang lưu…" / "Đã lưu", keep the input on errors.
 * - change(value): remember the latest value and save it after `delayMs` without further changes (typing).
 * - saveNow(value?): save at once (field blur, dropdowns, date pickers).
 * - flush(): before closing, save anything pending; resolves true when everything is saved (or nothing changed),
 *   false when the save failed (the sheet stays open and shows the error).
 * - A value equal to the last saved one is never sent; only one save runs at a time (a change made meanwhile is saved
 *   right after).
 * - save() may throw a FieldError to point at a field (validation or server message).
 */
export class FieldError extends Error {
  constructor(message: string, readonly field: string | null = null) {
    super(message);
    this.name = "FieldError";
  }
}

export type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
export type AutoSaveState = { status: AutoSaveStatus; error: string | null; field: string | null };

type Timers = { set: (callback: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
type Options<T> = {
  initial: T;
  save: (value: T) => Promise<void>;
  delayMs?: number;
  equals?: (left: T, right: T) => boolean;
  onState?: (state: AutoSaveState) => void;
  timers?: Timers;
};

const sameJson = <T>(left: T, right: T): boolean => JSON.stringify(left) === JSON.stringify(right);

export function createAutoSaver<T>(options: Options<T>) {
  const delayMs = options.delayMs ?? 600;
  const equals = options.equals ?? sameJson;
  const timers: Timers = options.timers ?? { set: (callback, ms) => setTimeout(callback, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  let saved = options.initial;
  let latest = options.initial;
  let timer: unknown = null;
  let running: Promise<boolean> | null = null;
  let state: AutoSaveState = { status: "idle", error: null, field: null };
  const emit = (next: AutoSaveState) => { state = next; options.onState?.(next); };
  const cancelTimer = () => { if (timer !== null) { timers.clear(timer); timer = null; } };

  /** Saves `latest` if it differs from what was saved; repeats while changes arrive during a save. */
  const run = async (): Promise<boolean> => {
    if (running) {
      await running;
      return run();
    }
    if (equals(latest, saved)) {
      if (state.status === "pending") emit({ status: state.error ? "error" : "idle", error: state.error, field: state.field });
      return state.status !== "error";
    }
    const value = latest;
    emit({ status: "saving", error: null, field: null });
    running = (async () => {
      try {
        await options.save(value);
        saved = value;
        emit({ status: "saved", error: null, field: null });
        return true;
      } catch (error) {
        emit({ status: "error", error: error instanceof Error ? error.message : "Không lưu được.", field: error instanceof FieldError ? error.field : null });
        return false;
      }
    })();
    const ok = await running;
    running = null;
    // Something changed while saving: save that too.
    if (ok && !equals(latest, saved)) return run();
    return ok;
  };

  return {
    change(value: T): void {
      latest = value;
      cancelTimer();
      // Back to the saved value: nothing to send (and an old error no longer applies).
      if (equals(latest, saved)) { emit({ status: state.status === "saving" ? "saving" : "idle", error: null, field: null }); return; }
      emit({ status: "pending", error: state.error, field: state.field });
      timer = timers.set(() => { timer = null; void run(); }, delayMs);
    },
    saveNow(value?: T): Promise<boolean> {
      if (value !== undefined) latest = value;
      cancelTimer();
      return run();
    },
    flush(): Promise<boolean> {
      cancelTimer();
      return run();
    },
    /** Drop pending work (the item was deleted). */
    cancel(): void {
      cancelTimer();
      latest = saved;
    },
    state: (): AutoSaveState => state,
  };
}
