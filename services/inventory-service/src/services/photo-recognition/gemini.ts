/**
 * Fallback when CLIP is unsure: Gemini looks at the photo and picks at most 3 names from the same catalog list.
 * Only the photo and the catalog names are sent (no family or user data). The API key goes in the x-goog-api-key
 * header and is never logged. Strict JSON (array of strings); names that are not in the list are dropped.
 */
export type GeminiConfig = { apiKey: string; model: string };
export type GeminiPicker = (image: Buffer, mimeType: string, names: string[]) => Promise<string[]>;

export const GEMINI_TIMEOUT_MS = 10_000;

export const geminiConfig = (env: NodeJS.ProcessEnv = process.env): GeminiConfig | null => {
  const apiKey = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim();
  return apiKey && model ? { apiKey, model } : null;
};

export const buildPrompt = (names: string[]): string => [
  "Ảnh chụp một nguyên liệu hoặc thực phẩm trong bếp gia đình Việt Nam.",
  "Chọn tối đa 3 tên khớp nhất với thứ chính trong ảnh, CHỈ từ danh sách sau (giữ nguyên chữ):",
  names.join("; "),
  "Nếu không chắc hoặc không có tên nào khớp, trả về mảng rỗng. Chỉ trả về JSON: mảng chuỗi.",
].join("\n");

export function createGeminiPicker(config: GeminiConfig, fetchImpl: typeof fetch = fetch, timeoutMs = GEMINI_TIMEOUT_MS): GeminiPicker {
  return async (image, mimeType, names) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(names) }, { inline_data: { mime_type: mimeType, data: image.toString("base64") } }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" }, maxItems: 3 }, temperature: 0 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Gemini answered ${response.status}`);
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Gemini answer is not a JSON array");
    const allowed = new Set(names);
    return [...new Set(parsed.filter((value): value is string => typeof value === "string" && allowed.has(value)))].slice(0, 3);
  };
}

/** Per-family daily limit (Vietnam day), in memory: resets when the service restarts. */
export function createDailyLimit(limit: number, now: () => Date = () => new Date()) {
  const used = new Map<string, number>();
  const day = () => new Date(now().getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  return {
    /** Takes one call for the family; false when the day's limit is used up. */
    take(familyId: string): boolean {
      const key = `${day()}|${familyId}`;
      const count = used.get(key) ?? 0;
      if (count >= limit) return false;
      if (used.size > 10_000) used.clear();
      used.set(key, count + 1);
      return true;
    },
  };
}
