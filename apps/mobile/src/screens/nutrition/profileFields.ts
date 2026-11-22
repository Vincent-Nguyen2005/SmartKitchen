import type { ActivityLevel } from "./nutritionProfileApi";

/**
 * Basic health info rules shared by Hồ sơ › Thông tin sức khỏe and the sign-in onboarding wizard
 * (one source of truth for ranges, parsing and messages).
 */

/** The calorie calculation uses light activity by default (the section was removed; existing profiles keep theirs). */
export const DEFAULT_ACTIVITY: ActivityLevel = "LIGHTLY_ACTIVE";
export const MIN_BIRTH_DATE = "1900-01-01";
/** Height is entered in meters (stored and sent in cm). */
export const HEIGHT_RANGE_M = { min: 0.5, max: 2.5 };
export const WEIGHT_RANGE = { min: 2, max: 300 };

const pad2 = (value: number) => String(value).padStart(2, "0");
const isoDay = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
export const todayIso = () => isoDay(new Date());

/** Full years between a YYYY-MM-DD birth date and today. */
export function ageFrom(birthDate: string, today: string = todayIso()): number | null {
  const birth = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const now = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!birth || !now) return null;
  let age = Number(now[1]) - Number(birth[1]);
  if (`${now[2]}-${now[3]}` < `${birth[2]}-${birth[3]}`) age -= 1;
  return age;
}

/** The API stores only the age: an existing profile is shown with the birth date that gives that age today. */
export const birthDateForAge = (age: number): string => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - age);
  return isoDay(date);
};

/** Month the birth-date calendar opens on while empty: January of (current year - 25). */
export const birthCalendarStart = (): string => `${new Date().getFullYear() - 25}-01-01`;

/** Decimal text: "," becomes ".", digits and one dot only, at most 2 decimals. */
export function normalizeDecimal(value: string): string {
  const cleaned = value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

/** Out-of-range message for a filled decimal field; null while empty or valid. */
export const rangeError = (text: string, range: { min: number; max: number }, unit: string): string | null => {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= range.min && value <= range.max ? null : `Nhập từ ${range.min} đến ${range.max} ${unit}.`;
};

export const heightRangeError = (text: string): string | null => {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= HEIGHT_RANGE_M.min && value <= HEIGHT_RANGE_M.max ? null : "Nhập từ 0.50 đến 2.50 m.";
};
export const weightRangeError = (text: string) => rangeError(text, WEIGHT_RANGE, "kg");

/** null when the birth date gives an age of 1-130 years. */
export function birthDateError(birthDate: string): string | null {
  const age = ageFrom(birthDate);
  if (age === null) return "Chọn ngày sinh.";
  if (age < 1) return "Ngày sinh phải cách hôm nay ít nhất 1 năm.";
  return age > 130 ? "Nhập ngày sinh hợp lệ." : null;
}

export const heightValid = (text: string) => !!text.trim() && !heightRangeError(text);
export const weightValid = (text: string) => !!text.trim() && !weightRangeError(text);

/** Meters text -> centimeters for the API, rounded to 1 decimal ("1.70" -> 170). */
export const heightToCm = (meters: string): number => Math.round(Number(meters) * 1000) / 10;
/** Stored centimeters -> meters text with 2 decimals (170 -> "1.70"). */
export const cmToHeightText = (cm: number): string => (Number.isFinite(cm) ? (cm / 100).toFixed(2) : "");
/** The familiar reading of a valid height: "1.70" -> "1m70", "1.05" -> "1m05", "2" -> "2m00"; null when invalid. */
export function heightReading(meters: string): string | null {
  if (!heightValid(meters)) return null;
  const [whole, fraction] = Number(meters).toFixed(2).split(".");
  return `${whole}m${fraction}`;
}

/** The one message for the whole basic info (null = ready to save). */
export function basicsError(height: string, weight: string, birthDate: string): string | null {
  if (heightValid(height) && weightValid(weight) && !birthDateError(birthDate)) return null;
  const age = ageFrom(birthDate);
  return age !== null && age < 1 ? "Ngày sinh phải cách hôm nay ít nhất 1 năm." : "Nhập chiều cao, cân nặng và ngày sinh hợp lệ.";
}
