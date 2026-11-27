/**
 * Quản trị › "Chụp ảnh" (pure; covered by catalogPhoto.test.ts): after the photo, the admin picks the catalog
 * ingredient it shows. Products without an image come first (alphabetical), then the rest; the header counts the ones
 * still missing an image; replacing an existing image asks first.
 */
export type CatalogProduct = { id: string; name: string; category: string; imageUrl: string | null; isActive: boolean };

const key = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").trim().toLocaleLowerCase("vi");
const hasImage = (product: Pick<CatalogProduct, "imageUrl">): boolean => Boolean(product.imageUrl?.trim());

/** Search (no accents needed), then: without an image first, each part alphabetical (Vietnamese order). */
export function photoPickerOrder(products: CatalogProduct[], search = ""): CatalogProduct[] {
  const term = key(search);
  const shown = term ? products.filter((product) => key(product.name).includes(term)) : products;
  return [...shown].sort((first, second) => Number(hasImage(first)) - Number(hasImage(second)) || first.name.localeCompare(second.name, "vi"));
}

export const missingImageCount = (products: CatalogProduct[]): number => products.filter((product) => !hasImage(product)).length;

/** "Còn 12 nguyên liệu chưa có ảnh" / "Tất cả nguyên liệu đã có ảnh". */
export const missingImageText = (count: number): string => (count > 0 ? `Còn ${count} nguyên liệu chưa có ảnh` : "Tất cả nguyên liệu đã có ảnh");

/** The confirm dialog before uploading: a replacement says so (destructive). */
export const uploadConfirm = (product: Pick<CatalogProduct, "name" | "imageUrl">) => (hasImage(product)
  ? { title: `Thay ảnh của ${product.name}?`, message: "Ảnh hiện tại sẽ được thay bằng ảnh vừa chụp.", confirmLabel: "Thay ảnh", destructive: true }
  : { title: `Đặt ảnh cho ${product.name}?`, message: "Ảnh sẽ hiện cho mọi người dùng trong Đi chợ và Kho.", confirmLabel: "Đặt ảnh", destructive: false });

export { hasImage };
