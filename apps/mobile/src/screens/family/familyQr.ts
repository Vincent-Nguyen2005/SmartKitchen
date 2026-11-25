/**
 * "QR gia đình" (capture bar). Pure helpers (no React Native), covered by familyQr.test.ts.
 * - The family OWNER shows a one-time join QR; everyone else (members, users without a family) scans one.
 * - The owner's token lives only while the sheet is open: closing it, the app going to the background, or the sheet
 *   unmounting revokes it (QrSession); the server also expires it after 10 minutes.
 */
export type FamilyQrAction = "show" | "scan";

export const familyQrAction = (role: string | null | undefined): FamilyQrAction => (role === "OWNER" ? "show" : "scan");

/** Owner's full-screen QR page: the title and the one line under the QR. */
export const QR_TITLE = "QR gia đình";
export const QR_CAPTION = "Quét mã QR để tham gia gia đình";
/** QR side in px: 75% of the screen width, at most 320 (at least 180 on very small screens). */
export const qrDisplaySize = (screenWidth: number): number => Math.max(180, Math.min(320, Math.round(screenWidth * 0.75)));
export const QR_EXPIRED_TEXT = "Mã QR đã hết hạn, nhờ chủ nhà mở lại mã";
export const ALREADY_MEMBER_TEXT = "Bạn đã ở trong gia đình này";
export const OTHER_FAMILY_TEXT = "Bạn đang ở một gia đình khác. Hãy rời gia đình đó trong tab Gia đình trước khi tham gia gia đình mới.";

/** Message for a failed verify / join (by the server's error code); unknown errors keep their own message. */
export function qrErrorText(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "QR_EXPIRED") return QR_EXPIRED_TEXT;
  if (code === "ALREADY_MEMBER") return ALREADY_MEMBER_TEXT;
  if (code === "OTHER_FAMILY") return OTHER_FAMILY_TEXT;
  if (code === "RATE_LIMITED") return "Bạn thử quá nhiều lần, hãy đợi một lát rồi quét lại.";
  return error instanceof Error && error.message ? error.message : "Chưa tham gia được gia đình. Thử lại nhé.";
}

/** What to do after a scan was verified: ask to join, or explain why not. */
export function afterVerify(membership: "none" | "this" | "other"): { kind: "confirm" } | { kind: "message"; text: string } {
  if (membership === "this") return { kind: "message", text: ALREADY_MEMBER_TEXT };
  if (membership === "other") return { kind: "message", text: OTHER_FAMILY_TEXT };
  return { kind: "confirm" };
}

/**
 * The owner's QR while the sheet is open. `open()` asks for a fresh token; `close()` (close button, Android back,
 * swipe down, leaving the screen, app in the background) revokes it once. A token that arrives after close is
 * revoked right away and never shown.
 */
export class QrSession<T extends { token: string }> {
  private current: T | null = null;
  private opened = false;
  private generation = 0;

  constructor(private readonly api: { create: () => Promise<T>; revoke: (token: string) => Promise<void> }, private readonly onChange: (qr: T | null) => void) {}

  async open(): Promise<T | null> {
    this.opened = true;
    const generation = ++this.generation;
    const qr = await this.api.create();
    if (!this.opened || generation !== this.generation) {
      void this.api.revoke(qr.token).catch(() => undefined);
      return null;
    }
    this.current = qr;
    this.onChange(qr);
    return qr;
  }

  /** Idempotent; the revoke runs in the background (the server's 10-minute expiry covers a failed call). */
  close(): void {
    this.opened = false;
    this.generation += 1;
    const qr = this.current;
    this.current = null;
    this.onChange(null);
    if (qr) void this.api.revoke(qr.token).catch(() => undefined);
  }

  /** App state change: anything but "active" closes the QR. */
  onAppState(state: string): boolean {
    if (state !== "active" && this.opened) { this.close(); return true; }
    return false;
  }
}
