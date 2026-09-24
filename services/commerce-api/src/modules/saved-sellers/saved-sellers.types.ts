export type SavedSellerView = {
  id: string;
  sellerId: string;
  storefrontSlug: string | null;
  displayName: string | null;
  description: string | null;
  averageRating: number | null;
  ratingCount: number;
  /** False once the seller is no longer an approved, reachable storefront. */
  isAvailable: boolean;
};
