const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh, no daylight saving

/** Today's calendar day in Vietnam, YYYY-MM-DD. */
export const vnToday = (now: Date = new Date()): string => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** YYYY-MM-DD of a stored @db.Date value (Prisma returns it at UTC midnight). */
export const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

/** Full years from a YYYY-MM-DD birth date to `today` (YYYY-MM-DD, Vietnam). */
export function ageFromBirthDate(birthDate: string, today: string = vnToday()): number {
  const [birthYear, birthMonthDay] = [Number(birthDate.slice(0, 4)), birthDate.slice(5)];
  const [year, monthDay] = [Number(today.slice(0, 4)), today.slice(5)];
  return year - birthYear - (monthDay < birthMonthDay ? 1 : 0);
}
