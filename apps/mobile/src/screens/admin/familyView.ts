/**
 * Quản trị › Gia đình (pure; covered by familyView.test.ts): an admin sees only a family's name, member count and
 * created date, never member names, emails or other member data (admin-service strips them too).
 */
export type AdminFamilyView = { id: string; name: string; memberCount: number; createdAt: string };

/** Only the fields an admin may see, whatever else a response carries. */
export const familyView = (family: AdminFamilyView): AdminFamilyView => ({ id: family.id, name: family.name, memberCount: family.memberCount, createdAt: family.createdAt });

/** "12/11/2026" (Vietnam day); "—" when unknown. */
export const familyDate = (iso: string): string => {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "—";
  const day = new Date(time + 7 * 3_600_000).toISOString();
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
};

/** "3 thành viên · Tạo ngày 12/11/2026" (list rows and the detail). */
export const familyFacts = (family: Pick<AdminFamilyView, "memberCount" | "createdAt">): string => `${family.memberCount} thành viên · Tạo ngày ${familyDate(family.createdAt)}`;
