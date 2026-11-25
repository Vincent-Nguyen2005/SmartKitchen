/** Hồ sơ display name rule (auth-service PATCH /api/auth/me checks the same): 1-50 characters after trimming. */
export const NAME_MAX_LENGTH = 50;

/** Problem message for a typed name, or null when it can be saved. Pure, covered by profileName.test.ts. */
export function nameProblem(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Tên không được để trống.";
  if (trimmed.length > NAME_MAX_LENGTH) return `Tên tối đa ${NAME_MAX_LENGTH} ký tự.`;
  return null;
}

/** Avatar fallback: up to two initials ("Nguyễn Văn An" -> "NA"; one word -> its first letter); "?" without a name. */
export const initialsOf = (name: string | null | undefined): string => {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return `${first}${last}`.toLocaleUpperCase("vi");
};
