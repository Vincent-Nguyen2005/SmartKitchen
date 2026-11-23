export interface FoodItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  storageLocation: string;
  expiryDate: string | null;
  status: string;
  barcode?: string | null;
  /** Gateway path of an uploaded photo, an external image URL, or null. */
  imageUrl?: string | null;
  /** Admin catalog product id when bought from Giỏ hàng (exact match for the catalog image fallback). */
  productId?: string | null;
  category?: { id: string; name: string } | null;
}

export interface ShoppingItem {
  id: string;
  shoppingListId: string;
  name: string;
  quantity: number;
  unit: string;
  isPurchased: boolean;
  note?: string;
}

export interface ShoppingList {
  id: string;
  familyId: string;
  name: string;
  status: string;
  createdAt: string;
  items: ShoppingItem[];
}
