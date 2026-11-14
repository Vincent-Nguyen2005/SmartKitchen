import { colors } from "../../theme";
import { query, type GatewayClient, type Page } from "../notifications/gatewayApi";

/**
 * Admin directory (owner: Huy, SCRUM-283). Shapes match admin-service /users and /families,
 * which proxy auth-service and family-service /internal/admin/*. Calls go through the gateway
 * client, which attaches the signed-in user's access token.
 */
export type UserRole = "USER" | "ADMIN";
export type FamilyRole = "OWNER" | "ADMIN" | "MEMBER";

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
};

export type AdminFamilySummary = {
  id: string;
  name: string;
  memberCount: number;
  ownerEmail: string;
  createdAt: string;
};

export type AdminFamilyMember = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: FamilyRole;
  /** Not returned by family-service yet; shown when present. */
  joinedAt?: string;
};

export type AdminFamilyDetail = AdminFamilySummary & { members: AdminFamilyMember[] };

/** The directory endpoints accept at most 100 items per page. */
export const MAX_PAGE_SIZE = 100;

export const fetchUsers = (api: GatewayClient, limit: number): Promise<Page<AdminUser>> =>
  api.get<Page<AdminUser>>(`/api/admin/users${query({ limit })}`);

export const fetchFamilies = (api: GatewayClient, limit: number): Promise<Page<AdminFamilySummary>> =>
  api.get<Page<AdminFamilySummary>>(`/api/admin/families${query({ limit })}`);

export const fetchFamily = (api: GatewayClient, id: string): Promise<AdminFamilyDetail> =>
  api.get<AdminFamilyDetail>(`/api/admin/families/${encodeURIComponent(id)}`);

export const userRoleBadge: Record<UserRole, { label: string; color: string; background: string }> = {
  ADMIN: { label: "Quản trị", color: colors.warning, background: colors.warningSoft },
  USER: { label: "Người dùng", color: colors.primary, background: colors.primarySoft },
};

export const familyRoleText: Record<FamilyRole, string> = {
  OWNER: "Chủ gia đình",
  ADMIN: "Quản lý",
  MEMBER: "Thành viên",
};

export const displayName = (person: { name: string | null; email: string | null }): string =>
  person.name?.trim() || person.email || "Không rõ tên";

export const initial = (person: { name: string | null; email: string | null }): string =>
  (displayName(person).trim().charAt(0) || "?").toUpperCase();

export const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "–" : date.toLocaleDateString("vi-VN");
};
