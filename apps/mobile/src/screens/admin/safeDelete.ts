import { GatewayApiError } from "../notifications/gatewayApi";

type Confirm = (request: { title: string; message: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean }) => Promise<boolean>;

/** inUse: refused (409 IN_USE) for a row that is already hidden; `message` explains why. */
export type SafeDeleteResult = { kind: "deleted" | "hidden" | "cancelled" } | { kind: "inUse"; message: string };

/** Short reasons the server sent with 409 IN_USE (e.g. "có trong 2 danh sách đi chợ"). */
const inUseReasons = (error: GatewayApiError): string[] => {
  const details = error.details as { reasons?: unknown } | undefined;
  return Array.isArray(details?.reasons) ? details.reasons.filter((reason): reason is string => typeof reason === "string") : [];
};

/**
 * Quản trị "Xóa": asks "Xóa vĩnh viễn <tên>? Không thể hoàn tác.", then deletes. When the server answers 409 IN_USE
 * nothing was deleted, and the admin is offered "Ẩn" (soft delete) instead. Other errors are thrown to the caller.
 */
export async function safeDelete(options: {
  confirm: Confirm;
  name: string;
  /** Shown on 409 IN_USE, e.g. "Món này đang được dùng nên không xóa được. Bạn có thể ẩn nó." */
  inUseText: string;
  remove: () => Promise<unknown>;
  /** Hides the row; omitted when it is already hidden (then the result is "inUse" with the message). */
  hide?: () => Promise<unknown>;
}): Promise<SafeDeleteResult> {
  const ok = await options.confirm({ title: `Xóa vĩnh viễn ${options.name}?`, message: "Không thể hoàn tác.", confirmLabel: "Xóa", destructive: true });
  if (!ok) return { kind: "cancelled" };
  try {
    await options.remove();
    return { kind: "deleted" };
  } catch (error) {
    if (!(error instanceof GatewayApiError) || error.status !== 409 || error.code !== "IN_USE") throw error;
    const reasons = inUseReasons(error);
    const message = reasons.length ? `${options.inUseText}\nLý do: ${reasons.join(", ")}.` : options.inUseText;
    if (!options.hide) return { kind: "inUse", message };
    const hide = await options.confirm({ title: "Không xóa được", message, confirmLabel: "Ẩn", cancelLabel: "Đóng" });
    if (!hide) return { kind: "cancelled" };
    await options.hide();
    return { kind: "hidden" };
  }
}
