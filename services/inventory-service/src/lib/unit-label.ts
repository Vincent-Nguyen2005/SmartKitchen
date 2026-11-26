/**
 * Kho unit words. Rows store the unit enum; a PIECE row may also store a specific word (unitLabel) so it shows
 * "2 quả" / "1 bìa" instead of a combined label. "cái" is PIECE's own word, so it is stored as null.
 */
export const PIECE_WORDS = ["cái", "quả", "trái", "bìa", "nải"] as const;
export type PieceWord = (typeof PIECE_WORDS)[number];

/** The unitLabel to store for `unit`: a specific piece word for PIECE rows, null for "cái" and every other unit. */
export function normalizeUnitLabel(unit: string, label: string | null | undefined): string | null {
  if (unit !== "PIECE" || !label) return null;
  const word = label.trim().toLowerCase();
  return word !== "cái" && (PIECE_WORDS as readonly string[]).includes(word) ? word : null;
}
