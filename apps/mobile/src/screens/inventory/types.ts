export type FoodItem = {
  id: string;
  familyId: string;
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  storageLocation: "FRIDGE" | "FREEZER" | "PANTRY" | "COUNTER";
  expiryDate?: string;
  status: "FRESH" | "NEAR_EXPIRY" | "EXPIRED" | "CONSUMED" | "DISCARDED";
  daysLeft?: number;
  createdAt: string;
  updatedAt: string;
};
