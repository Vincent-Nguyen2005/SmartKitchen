/**
 * Name key for duplicate detection: Unicode NFC (differently composed Vietnamese diacritics compare equal), trimmed,
 * inner whitespace collapsed, lower case. Diacritics are KEPT: "cà rốt" ≠ "ca rot" (different words in Vietnamese).
 * Exact comparison only; no fuzzy matching.
 */
export const normalizeName = (value: string): string =>
  value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");

export const sameName = (left: string, right: string): boolean => {
  const key = normalizeName(left);
  return key.length > 0 && key === normalizeName(right);
};
