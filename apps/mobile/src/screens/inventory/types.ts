export interface FoodItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  storageLocation: string;
  expiryDate: string | null;
  status: string;
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
