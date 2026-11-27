import axios from "axios";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/app-error";
import { promotionStatus, vnDay, type PromotionRule } from "./checkout-promotion";

/**
 * Quản trị › "Chương trình khuyến mãi" (admin CRUD with audit log) and what checkout reads (running rules, the
 * buyer's usage). Owned by shopping-list-service, which prices orders: the rules, the order and its usage are in one
 * database, so checkout never depends on another service for its total.
 *
 * Usage per user: orders with the promotion that are DELIVERED, plus orders still on the way (PENDING / SHIPPING),
 * which reserve a use so one cannot place several orders past the limit. CANCELLED / FAILED orders never consume a
 * use (the reservation is released).
 *
 * Thông báo: an active promotion is published to notification-service as an in-app promotion
 * (externalId "checkout-promotion:<id>", idempotent upsert; deactivated when switched off). A failure is logged and
 * the next save retries; checkout never depends on it.
 */
const isDay = (day: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);
const daySchema = z.string().refine(isDay, "Ngày không hợp lệ (YYYY-MM-DD)");
const optionalInt = (min: number, max: number, message: string) =>
  z.preprocess((value) => (value === "" || value === undefined ? null : value), z.number({ invalid_type_error: message }).int(message).min(min, message).max(max, message).nullable());

export const promotionInputSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên chương trình").max(120, "Tên tối đa 120 ký tự"),
  scope: z.enum(["ORDER", "GROUP", "PRODUCTS"]),
  groups: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  productIds: z.array(z.string().trim().min(1).max(64)).max(200).default([]),
  type: z.enum(["PERCENT", "AMOUNT"]),
  value: z.number({ invalid_type_error: "Nhập mức giảm" }).int("Mức giảm phải là số nguyên"),
  maxDiscount: optionalInt(1_000, 100_000_000, "Giảm tối đa từ 1.000 đ").default(null),
  minSubtotal: optionalInt(0, 1_000_000_000, "Đơn tối thiểu không hợp lệ").default(null),
  startDate: daySchema,
  endDate: daySchema,
  usageLimitPerUser: optionalInt(1, 1_000, "Số lần mỗi người từ 1 đến 1000").default(null),
  isActive: z.boolean().default(true),
}).superRefine((input, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (input.type === "PERCENT" && (input.value < 1 || input.value > 100)) issue("value", "Phần trăm từ 1 đến 100");
  if (input.type === "AMOUNT" && (input.value < 1_000 || input.value > 100_000_000)) issue("value", "Số tiền giảm từ 1.000 đ");
  if (input.type === "AMOUNT" && input.maxDiscount !== null) issue("maxDiscount", "Chỉ dùng cho giảm theo phần trăm");
  if (input.scope === "GROUP" && input.groups.length === 0) issue("groups", "Chọn ít nhất một nhóm");
  if (input.scope === "PRODUCTS" && input.productIds.length === 0) issue("productIds", "Chọn ít nhất một sản phẩm");
  if (isDay(input.startDate) && isDay(input.endDate) && input.endDate < input.startDate) issue("endDate", "Ngày kết thúc phải từ ngày bắt đầu trở đi");
});
export type PromotionInput = z.infer<typeof promotionInputSchema>;

type Row = {
  id: string; name: string; scope: "ORDER" | "GROUP" | "PRODUCTS"; groups: string[]; productIds: string[]; type: "PERCENT" | "AMOUNT"; value: number;
  maxDiscount: number | null; minSubtotal: number | null; startDate: Date; endDate: Date; usageLimitPerUser: number | null; isActive: boolean; createdAt: Date; updatedAt?: Date;
};
const day = (date: Date): string => date.toISOString().slice(0, 10);
export const ruleOf = (row: Row): PromotionRule => ({
  id: row.id, name: row.name, scope: row.scope, groups: row.groups, productIds: row.productIds, type: row.type, value: row.value,
  maxDiscount: row.maxDiscount, minSubtotal: row.minSubtotal, startDay: day(row.startDate), endDay: day(row.endDate),
  usageLimitPerUser: row.usageLimitPerUser, isActive: row.isActive, createdAt: row.createdAt,
});
/** Admin view: the stored fields with days as YYYY-MM-DD and the status label key. */
export const adminView = (row: Row, today: string = vnDay()) => {
  const rule = ruleOf(row);
  const { startDay, endDay, createdAt, ...rest } = rule;
  return { ...rest, startDate: startDay, endDate: endDay, status: promotionStatus(rule, today), createdAt: createdAt?.toISOString(), updatedAt: row.updatedAt?.toISOString() };
};
const columns = (input: PromotionInput) => ({
  ...input,
  groups: input.scope === "GROUP" ? [...new Set(input.groups)] : [],
  productIds: input.scope === "PRODUCTS" ? [...new Set(input.productIds)] : [],
  maxDiscount: input.type === "PERCENT" ? input.maxDiscount : null,
  startDate: new Date(`${input.startDate}T00:00:00.000Z`),
  endDate: new Date(`${input.endDate}T00:00:00.000Z`),
});

const NOTIFICATION_SERVICE_URL = () => (process.env.NOTIFICATION_SERVICE_URL || (process.env.NODE_ENV === "production" ? "http://notification-service:4010" : "http://localhost:4010")).replace(/\/+$/, "");
const fmt = (amount: number): string => `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}đ`;
/** The Thông báo text: "Giảm 10% (tối đa 50.000đ) cho đơn từ 200.000đ. Tự động áp dụng khi đặt hàng." */
export const promotionDescription = (rule: Pick<PromotionRule, "type" | "value" | "maxDiscount" | "minSubtotal" | "scope">): string => {
  const amount = rule.type === "PERCENT" ? `Giảm ${rule.value}%${rule.maxDiscount ? ` (tối đa ${fmt(rule.maxDiscount)})` : ""}` : `Giảm ${fmt(rule.value)}`;
  const what = rule.scope === "ORDER" ? "cho đơn hàng" : rule.scope === "GROUP" ? "cho nhóm hàng áp dụng" : "cho sản phẩm áp dụng";
  const minimum = rule.minSubtotal ? ` từ ${fmt(rule.minSubtotal)}` : "";
  return `${amount} ${what}${minimum}. Tự động áp dụng khi đặt hàng, không cần mã.`;
};
export const externalIdOf = (promotionId: string): string => `checkout-promotion:${promotionId}`;

/** Publish (active) or withdraw (off) the promotion in Thông báo. Never throws. */
export async function syncToFeed(row: Row): Promise<"synced" | "failed" | "skipped"> {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return "skipped";
  const path = `${NOTIFICATION_SERVICE_URL()}/internal/promotions/${encodeURIComponent(externalIdOf(row.id))}`;
  try {
    if (!row.isActive) await axios.post(`${path}/deactivate`, {}, { headers: { "x-api-key": key }, timeout: 5000 });
    else {
      await axios.put(path, {
        partnerName: "SmartKitchen",
        title: row.name,
        description: promotionDescription(ruleOf(row)),
        // No discountInfo: the feed shows the name as the title (not "<product> giảm X%").
        discountInfo: null,
        productKeywords: [row.name],
        startsAt: new Date(`${day(row.startDate)}T00:00:00.000+07:00`).toISOString(),
        endsAt: new Date(`${day(row.endDate)}T23:59:59.999+07:00`).toISOString(),
      }, { headers: { "x-api-key": key }, timeout: 5000 });
    }
    return "synced";
  } catch {
    console.warn(JSON.stringify({ event: "checkout_promotion_feed_sync_failed" }));
    return "failed";
  }
}

export class PromotionsService {
  /** Promotions that may apply today (active, within their days). */
  static async runningRules(today: string = vnDay()): Promise<PromotionRule[]> {
    const date = new Date(`${today}T00:00:00.000Z`);
    const rows = await prisma.checkoutPromotion.findMany({ where: { isActive: true, startDate: { lte: date }, endDate: { gte: date } } });
    return (rows as Row[]).map(ruleOf);
  }

  /** How many times the buyer already used each promotion (delivered, or still on the way). */
  static async usage(buyerUserId: string, promotionIds: string[]): Promise<Map<string, number>> {
    const usage = new Map<string, number>();
    if (promotionIds.length === 0) return usage;
    const orders = await prisma.purchase.findMany({
      where: { buyerUserId, promotionId: { in: promotionIds }, status: { in: ["PENDING", "SHIPPING", "DELIVERED"] } },
      select: { promotionId: true },
    });
    for (const order of orders) if (order.promotionId) usage.set(order.promotionId, (usage.get(order.promotionId) ?? 0) + 1);
    return usage;
  }

  /**
   * GET /promotions/active (any signed-in user): what Đi chợ shows while shopping (product tags for GROUP / PRODUCTS,
   * the banner for ORDER). Public fields only; no usage, no audit, no admin data. Ending soonest first.
   */
  static async activeForShoppers(today: string = vnDay()) {
    const rules = await this.runningRules(today);
    return rules
      .sort((first, second) => first.endDay.localeCompare(second.endDay) || first.id.localeCompare(second.id))
      .map((rule) => ({
        id: rule.id, name: rule.name, scope: rule.scope, groups: rule.groups, productIds: rule.productIds, type: rule.type, value: rule.value,
        maxDiscount: rule.maxDiscount, minSubtotal: rule.minSubtotal, startDate: rule.startDay, endDate: rule.endDay, usageLimitPerUser: rule.usageLimitPerUser,
      }));
  }

  static async list() {
    const rows = await prisma.checkoutPromotion.findMany({ orderBy: [{ isActive: "desc" }, { endDate: "desc" }, { createdAt: "desc" }] });
    const today = vnDay();
    const order: Record<string, number> = { RUNNING: 0, UPCOMING: 1, ENDED: 2, OFF: 3 };
    return (rows as Row[]).map((row) => adminView(row, today)).sort((first, second) => order[first.status] - order[second.status]);
  }

  static async create(adminUserId: string, input: PromotionInput) {
    if (input.endDate < vnDay()) throw new AppError(400, "PROMOTION_ENDED", "Ngày kết thúc phải từ hôm nay trở đi");
    const row = await prisma.$transaction(async (transaction) => {
      const created = await transaction.checkoutPromotion.create({ data: { ...columns(input), createdBy: adminUserId } });
      await transaction.promotionAuditLog.create({ data: { adminUserId, action: "CREATE", promotionId: created.id, metadata: { after: adminView(created as Row) } } });
      return created as Row;
    });
    return { promotion: adminView(row), feedSync: await syncToFeed(row) };
  }

  static async update(adminUserId: string, id: string, input: PromotionInput) {
    const row = await prisma.$transaction(async (transaction) => {
      const before = await transaction.checkoutPromotion.findUnique({ where: { id } });
      if (!before) throw new AppError(404, "NOT_FOUND", "Promotion not found");
      const updated = await transaction.checkoutPromotion.update({ where: { id }, data: columns(input) });
      await transaction.promotionAuditLog.create({ data: { adminUserId, action: "UPDATE", promotionId: id, metadata: { before: adminView(before as Row), after: adminView(updated as Row) } } });
      return updated as Row;
    });
    return { promotion: adminView(row), feedSync: await syncToFeed(row) };
  }

  static async setActive(adminUserId: string, id: string, isActive: boolean) {
    const row = await prisma.$transaction(async (transaction) => {
      const before = await transaction.checkoutPromotion.findUnique({ where: { id } });
      if (!before) throw new AppError(404, "NOT_FOUND", "Promotion not found");
      const updated = await transaction.checkoutPromotion.update({ where: { id }, data: { isActive } });
      await transaction.promotionAuditLog.create({ data: { adminUserId, action: isActive ? "ENABLE" : "DISABLE", promotionId: id, metadata: { before: { isActive: before.isActive }, after: { isActive } } } });
      return updated as Row;
    });
    return { promotion: adminView(row), feedSync: await syncToFeed(row) };
  }
}
