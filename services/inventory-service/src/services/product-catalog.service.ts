type OpenFoodFactsProduct = {
  code?: string;
  id?: string;
  product_name?: string;
  product_name_vi?: string;
  product_name_en?: string;
  brands?: string | string[];
  quantity?: string;
  image_front_url?: string;
};

export type CatalogProduct = {
  barcode: string;
  name: string;
  brand?: string;
  packageQuantity?: string;
  imageUrl?: string;
};

type CatalogSearch = { results: CatalogProduct[]; source: "Open Food Facts" };
type SearchHit = OpenFoodFactsProduct & {
  _source?: OpenFoodFactsProduct;
  source?: OpenFoodFactsProduct;
  document?: OpenFoodFactsProduct;
};
type SearchResponse = {
  hits?: SearchHit[] | { hits?: SearchHit[] };
};

type BarcodeLookup = {
  found: boolean;
  barcode: string;
  product: null | {
    barcode: string;
    name: string;
    brand?: string;
    packageQuantity?: string;
    imageUrl?: string;
  };
  source: "Open Food Facts";
};

const cache = new Map<string, { expiresAt: number; value: BarcodeLookup }>();
const searchCache = new Map<string, { expiresAt: number; value: CatalogSearch }>();
const searchRequestTimes: number[] = [];
const CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_RATE_WINDOW_MS = 60 * 1000;
const MAX_SEARCHES_PER_WINDOW = 8;

function productName(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const names = value as Record<string, unknown>;
  for (const language of ["vi", "en"]) {
    if (typeof names[language] === "string" && names[language].trim()) return names[language].trim();
  }
  const firstName = Object.values(names).find((name) => typeof name === "string" && name.trim());
  return typeof firstName === "string" ? firstName.trim() : undefined;
}

function productBrands(value: unknown): string | undefined {
  const brands = Array.isArray(value)
    ? value.filter((brand): brand is string => typeof brand === "string" && Boolean(brand.trim())).join(", ")
    : typeof value === "string" ? value.trim() : "";
  return brands || undefined;
}

function searchLimitError(): Error & { statusCode: number; code: string } {
  return Object.assign(new Error("Product search is busy. Wait a minute before searching again."), {
    statusCode: 429,
    code: "PRODUCT_SEARCH_RATE_LIMITED",
  });
}

export class ProductCatalogService {
  static async searchProducts(query: string): Promise<CatalogSearch> {
    const normalizedQuery = query.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
    const cached = searchCache.get(normalizedQuery);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const now = Date.now();
    while (searchRequestTimes.length && searchRequestTimes[0] <= now - SEARCH_RATE_WINDOW_MS) {
      searchRequestTimes.shift();
    }
    if (searchRequestTimes.length >= MAX_SEARCHES_PER_WINDOW) throw searchLimitError();
    searchRequestTimes.push(now);

    let response: Response;
    try {
      response = await fetch("https://search.openfoodfacts.org/search", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": process.env.OPENFOODFACTS_USER_AGENT || "SmartKitchen/1.0",
        },
        body: JSON.stringify({
          q: query.trim(),
          page: 1,
          page_size: 8,
          langs: ["vi", "en"],
          fields: ["code", "product_name", "product_name_vi", "product_name_en", "brands", "quantity", "image_front_url"],
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw Object.assign(new Error("Không kết nối được danh mục Open Food Facts. Thử lại sau hoặc nhập món thủ công."), {
        statusCode: 502,
        code: "PRODUCT_SEARCH_UNAVAILABLE",
      });
    }

    if (!response.ok) {
      throw Object.assign(new Error("Open Food Facts chưa trả kết quả tìm kiếm. Thử lại sau hoặc nhập món thủ công."), {
        statusCode: 502,
        code: "PRODUCT_SEARCH_UNAVAILABLE",
      });
    }

    const payload = await response.json().catch(() => null) as SearchResponse | null;
    const hits = Array.isArray(payload?.hits)
      ? payload.hits
      : Array.isArray(payload?.hits?.hits)
        ? payload.hits.hits
        : [];
    const results = hits.flatMap((hit): CatalogProduct[] => {
      const product = hit._source ?? hit.source ?? hit.document ?? hit;
      const barcode = (product.code || product.id || "").trim();
      const name = productName(product.product_name_vi) || productName(product.product_name) || productName(product.product_name_en);
      if (!/^\d{8,14}$/.test(barcode) || !name) return [];
      const brand = productBrands(product.brands);
      return [{
        barcode,
        name,
        ...(brand ? { brand } : {}),
        ...(product.quantity?.trim() ? { packageQuantity: product.quantity.trim() } : {}),
        ...(product.image_front_url ? { imageUrl: product.image_front_url } : {}),
      }];
    });
    const value: CatalogSearch = { results, source: "Open Food Facts" };
    searchCache.set(normalizedQuery, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, value });
    if (searchCache.size > 100) {
      const oldest = searchCache.keys().next().value;
      if (oldest) searchCache.delete(oldest);
    }
    return value;
  }

  static async lookupBarcode(barcode: string): Promise<BarcodeLookup> {
    const cached = cache.get(barcode);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const url = new URL(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}`);
    url.searchParams.set("fields", "code,product_name,product_name_vi,product_name_en,brands,quantity,image_front_url");
    url.searchParams.set("lc", "vi");
    url.searchParams.set("cc", "vn");
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": process.env.OPENFOODFACTS_USER_AGENT || "SmartKitchen/1.0" },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw Object.assign(new Error("Product lookup is temporarily unavailable. You can enter the item manually."), {
        statusCode: 502,
        code: "PRODUCT_LOOKUP_UNAVAILABLE",
      });
    }

    if (response.status === 404) {
      const value: BarcodeLookup = { found: false, barcode, product: null, source: "Open Food Facts" };
      cache.set(barcode, { expiresAt: Date.now() + CACHE_TTL_MS, value });
      return value;
    }
    if (!response.ok) {
      throw Object.assign(new Error("Product lookup is temporarily unavailable. You can enter the item manually."), {
        statusCode: 502,
        code: "PRODUCT_LOOKUP_UNAVAILABLE",
      });
    }

    const payload = await response.json().catch(() => null) as { product?: OpenFoodFactsProduct; status?: string } | null;
    const product = payload?.product;
    const name = product?.product_name_vi?.trim() || product?.product_name?.trim() || product?.product_name_en?.trim();
    const brand = productBrands(product?.brands);
    const value: BarcodeLookup = name
      ? {
          found: true,
          barcode,
          source: "Open Food Facts",
          product: {
            barcode,
            name,
            ...(brand ? { brand } : {}),
            ...(product?.quantity?.trim() ? { packageQuantity: product.quantity.trim() } : {}),
            ...(product?.image_front_url ? { imageUrl: product.image_front_url } : {}),
          },
        }
      : { found: false, barcode, product: null, source: "Open Food Facts" };
    cache.set(barcode, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    if (cache.size > 250) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    return value;
  }
}
