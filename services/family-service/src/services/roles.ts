import { FamilyRole } from ".prisma/client-family";

/**
 * Family roles are only the owner (chủ gia đình) and members (thành viên). The ADMIN value stays in the database enum
 * for old rows, but it grants nothing: a leftover ADMIN is treated as MEMBER everywhere (permissions and responses).
 * Data fix scripts/data-fixes/2026-12-family-admin-to-member.js turns those rows into MEMBER.
 * (The platform admin role "Quản trị" lives in auth-service and is unrelated.)
 */
export const effectiveRole = (role: FamilyRole): FamilyRole => (role === FamilyRole.ADMIN ? FamilyRole.MEMBER : role);

/** Roles a client may set or invite with: MEMBER only (ownership moves through transfer-ownership). */
export const assignableRole = (role: FamilyRole): boolean => role === FamilyRole.MEMBER;
