import { colors } from "../../theme";
import { query, type GatewayClient, type Page } from "../notifications/gatewayApi";
import { familyView, type AdminFamilyView } from "./familyView";

/**
 * Admin directory (owner: Huy, SCRUM-283). Shapes match admin-service /users and /families,
 * which proxy auth-service and family-service /internal/admin/*. Calls go through the gateway
 * client, which attaches the signed-in user's access token.
 */
export type UserRole = "USER" | "ADMIN" | "SHIPPER";

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
};

/** A family as an admin sees it: name, member count and created date only (no member data). */
export type AdminFamilySummary = AdminFamilyView;
export type AdminFamilyDetail = AdminFamilyView;

/** The directory endpoints accept at most 100 items per page. */
export const MAX_PAGE_SIZE = 100;

export const fetchUsers = (api: GatewayClient, limit: number): Promise<Page<AdminUser>> =>
  api.get<Page<AdminUser>>(`/api/admin/users${query({ limit })}`);

export const fetchFamilies = async (api: GatewayClient, limit: number): Promise<Page<AdminFamilySummary>> => {
  const page = await api.get<Page<AdminFamilySummary>>(`/api/admin/families${query({ limit })}`);
  return { ...page, items: page.items.map(familyView) };
};

export const fetchFamily = async (api: GatewayClient, id: string): Promise<AdminFamilyDetail> =>
  familyView(await api.get<AdminFamilyDetail>(`/api/admin/families/${encodeURIComponent(id)}`));

export const userRoleBadge: Record<UserRole, { label: string; color: string; background: string }> = {
  ADMIN: { label: "Quản trị", color: colors.warning, background: colors.warningSoft },
  USER: { label: "Người dùng", color: colors.primary, background: colors.primarySoft },
  SHIPPER: { label: "Người giao hàng", color: colors.success, background: colors.successSoft },
};

export const displayName = (person: { name: string | null; email: string | null }): string =>
  person.name?.trim() || person.email || "Không rõ tên";

export const initial = (person: { name: string | null; email: string | null }): string =>
  (displayName(person).trim().charAt(0) || "?").toUpperCase();

export const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "–" : date.toLocaleDateString("vi-VN");
};
