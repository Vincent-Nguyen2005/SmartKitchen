export const normalizeKeyword = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const normalizedKeywords = (values: string[]): string[] => [...new Set(values.map(normalizeKeyword).filter(Boolean))];

export const keywordsOverlap = (promotionKeywords: string[], requestedKeywords: string[]): boolean => {
  const promotion = new Set(normalizedKeywords(promotionKeywords));
  return normalizedKeywords(requestedKeywords).some((keyword) => promotion.has(keyword));
};

export const isWithinQuietHours = (date: Date, start: string | null, end: string | null, timeZone: string): boolean => {
  if (!start || !end) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  const current = hour * 60 + minute;
  const parse = (value: string): number => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const quietStart = parse(start);
  const quietEnd = parse(end);
  return quietStart <= quietEnd ? current >= quietStart && current < quietEnd : current >= quietStart || current < quietEnd;
};
