export const normalizeKeyword = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const normalizedKeywords = (values: string[]): string[] => [...new Set(values.map(normalizeKeyword).filter(Boolean))];

export const keywordsOverlap = (promotionKeywords: string[], requestedKeywords: string[]): boolean => {
  const promotion = new Set(normalizedKeywords(promotionKeywords));
  return normalizedKeywords(requestedKeywords).some((keyword) => promotion.has(keyword));
};
