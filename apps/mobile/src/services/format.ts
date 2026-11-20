/** Whole VND with dot thousands separators: 25000 -> "25.000đ". */
export const formatVnd = (amount: number): string =>
  `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}đ`;

/** Price after a percentage discount, rounded to whole VND. */
export const discountedPrice = (price: number, percent: number): number => Math.round((price * (100 - percent)) / 100);
