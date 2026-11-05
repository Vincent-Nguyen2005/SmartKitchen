type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  product_name_vi?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  image_front_url?: string;
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
const CACHE_TTL_MS = 15 * 60 * 1000;

export class ProductCatalogService {
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
        headers: { "User-Agent": process.env.OPENFOODFACTS_USER_AGENT || "SmartKitchen/1.0 (contact@example.com)" },
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
    const value: BarcodeLookup = name
      ? {
          found: true,
          barcode,
          source: "Open Food Facts",
          product: {
            barcode,
            name,
            ...(product?.brands?.trim() ? { brand: product.brands.trim() } : {}),
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
