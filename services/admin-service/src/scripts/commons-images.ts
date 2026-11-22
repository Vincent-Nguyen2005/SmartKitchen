/**
 * Wikimedia Commons photo lookup for catalog ingredients (pure helpers + one search call). Only files whose license
 * allows reuse (CC0, CC BY, CC BY-SA, public domain; never NC / ND) are accepted, and the file title must contain
 * every word of the search term, so a match is "confident": English terms accent-insensitive, Vietnamese terms WITH
 * accents (unaccented Vietnamese words are ambiguous: "bơ" is not the town "Bo"). The stored URL is the
 * upload.wikimedia.org thumbnail (about 500 px wide).
 */
export type CommonsImage = { imageUrl: string; imageSource: string; imageAuthor: string; imageLicense: string; title: string };

type ImageInfo = {
  thumburl?: string;
  thumbwidth?: number;
  width?: number;
  mime?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string } | undefined>;
};
export type CommonsPage = { title: string; index?: number; imageinfo?: ImageInfo[] };

const THUMB_WIDTH = 500;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const MIN_WIDTH = 400;
const USER_AGENT = "SmartKitchenCatalogImages/1.0 (catalog image filler; one request at a time)";
/** Not a photo of the raw ingredient (reviewed against real Commons results): people, events, art, diagrams, dishes. */
const BAD_PHRASES = ["still life", "national gallery", "cabbage white"];
const BAD_WORDS = ["performing", "fisherman", "truck", "fair", "concert", "band", "club", "kids", "event", "brand", "gallery", "insect", "spider", "butterfly", "acid", "tank", "filter", "purifier", "punch", "stir", "shells", "preserved", "fermented", "salted", "collection", "museum", "engraving", "lithograph", "watercolor", "watercolour", "herbarium", "specimen", "botanical", "logo", "map", "diagram", "drawing", "illustration", "icon", "chart", "flag", "poster", "painting", "stamp", "cartoon", "clipart", "svg", "coat", "arms", "label", "menu", "sign", "advert", "statue", "plant", "flower", "tree", "field", "seedling", "leaf", "leaves"];

export const plain = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const words = (value: string): string[] => plain(value).split(" ").filter(Boolean);

/** Reusable license (short name from Commons extmetadata), e.g. "CC BY-SA 4.0", "CC0", "Public domain". */
export function reusableLicense(shortName: string | undefined): boolean {
  if (!shortName) return false;
  const value = shortName.toLowerCase().trim();
  if (/\b(nc|nd)\b|non-?commercial|no ?deriv/.test(value)) return false;
  return /^cc0\b/.test(value) || /^cc[- ]by(-sa)?\b/.test(value) || /public domain/.test(value) || /^pd(\b|-)/.test(value);
}

/** Commons "Artist" is HTML: tags removed, entities decoded, spaces collapsed. */
export function plainAuthor(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Lower case, accents kept (NFC), words separated by single spaces. */
const accented = (value: string): string => value.normalize("NFC").toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const isVietnamese = (value: string): boolean => plain(value) !== value.normalize("NFC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** A "not a food photo" word (singular or plural, unless the term itself uses it) or phrase in the title. */
const looksWrong = (title: string, allowed: string[] = []): boolean => {
  const name = ` ${plain(title)} `;
  return BAD_PHRASES.some((phrase) => name.includes(` ${phrase} `))
    || BAD_WORDS.some((word) => !allowed.includes(word) && (name.includes(` ${word} `) || name.includes(` ${word}s `)));
};

/**
 * The title (without "File:" and extension) contains every word of the term and none of the "not a food photo" words.
 * A Vietnamese term (with diacritics) must match with its accents.
 */
export function titleMatches(title: string, term: string): boolean {
  const bare = title.replace(/^File:/i, "").replace(/\.[a-z0-9]+$/i, "");
  if (isVietnamese(term)) {
    // The Vietnamese words as one phrase, in order ("nước suối" is not "suối nước nóng").
    if (looksWrong(bare)) return false;
    return ` ${accented(bare)} `.includes(` ${accented(term)} `);
  }
  const name = ` ${plain(bare)} `;
  const wanted = words(term);
  if (wanted.length === 0) return false;
  if (looksWrong(bare, wanted)) return false;
  return wanted.every((word) => name.includes(` ${word} `) || name.includes(` ${word}s `) || name.includes(` ${word}es `));
}

/**
 * The thumbnail on upload.wikimedia.org: Commons may answer with thumb.wikimedia.org (same path) and tracking query
 * parameters; both hosts serve the same file. Anything else is not accepted.
 */
export function uploadThumbUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!["upload.wikimedia.org", "thumb.wikimedia.org"].includes(parsed.hostname)) return null;
    if (!parsed.pathname.startsWith("/wikipedia/commons/")) return null;
    return `https://upload.wikimedia.org${parsed.pathname}`;
  } catch {
    return null;
  }
}

/** First acceptable file in search order: photo, wide enough, reusable license, title matching the term. */
export function pickImage(pages: CommonsPage[], term: string): CommonsImage | null {
  const ordered = [...pages].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  for (const page of ordered) {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl || !info.descriptionurl) continue;
    if (!/^image\/(jpeg|png|webp)$/.test(info.mime ?? "")) continue;
    if ((info.width ?? 0) < MIN_WIDTH) continue;
    const imageUrl = uploadThumbUrl(info.thumburl);
    if (!imageUrl) continue;
    const license = info.extmetadata?.LicenseShortName?.value?.trim();
    if (!reusableLicense(license)) continue;
    if (!titleMatches(page.title, term)) continue;
    return {
      imageUrl,
      imageSource: info.descriptionurl,
      imageAuthor: plainAuthor(info.extmetadata?.Artist?.value) || "Không rõ tác giả",
      imageLicense: license!.slice(0, 100),
      title: page.title,
    };
  }
  return null;
}

/** One Commons search (files only), with image info, license metadata and a ~500 px thumbnail. */
export async function searchCommons(term: string, fetchImpl: typeof fetch = fetch, wait: (ms: number) => Promise<void> = sleep): Promise<CommonsPage[]> {
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", generator: "search", gsrsearch: `${term} filetype:bitmap`,
    gsrnamespace: "6", gsrlimit: "20", prop: "imageinfo", iiprop: "url|mime|size|extmetadata", iiurlwidth: String(THUMB_WIDTH),
    iiextmetadatafilter: "LicenseShortName|Artist",
  });
  // Throttled (429): wait as long as Commons asks (Retry-After, at most 90 s), up to 4 tries.
  let response: globalThis.Response | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetchImpl(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 429) break;
    const seconds = Number(response.headers.get("retry-after")) || 30;
    await wait(Math.min(90, seconds) * 1000 + 500);
  }
  if (!response || !response.ok) throw new Error(`Commons answered ${response?.status ?? "nothing"}`);
  const body = await response.json() as { query?: { pages?: CommonsPage[] } };
  return body.query?.pages ?? [];
}

/**
 * English name first (more photos on Commons), then the Vietnamese name, but only when it has two or more words: a
 * single Vietnamese word ("Muối", "Tiêu", "Bơ") is too ambiguous on Commons.
 */
export async function findImage(names: { vi: string; en?: string }, search: (term: string) => Promise<CommonsPage[]> = (term) => searchCommons(term)): Promise<CommonsImage | null> {
  const vi = names.vi.trim().split(/\s+/).length >= 2 ? names.vi : undefined;
  for (const term of [names.en, vi].filter((value): value is string => !!value)) {
    const pick = pickImage(await search(term), term);
    if (pick) return pick;
  }
  return null;
}
