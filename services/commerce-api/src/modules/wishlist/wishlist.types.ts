export type WishlistItemView = {
  id: string;
  offerId: string;
  currentPrice: { amount: number; currency: string } | null;
  isAvailable: boolean;
};
