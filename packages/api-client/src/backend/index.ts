/**
 * Endpoints as the Commerce API actually exposes them today.
 *
 * These speak the backend's own shapes rather than the marketplace contract
 * the clients were first built against, so the two can be reconciled in one
 * place instead of inside every page.
 */
export * from './admin-orders.ts';
export * from './auth.ts';
export * from './catalog.ts';
export * from './financials.ts';
export * from './fulfillment.ts';
export * from './inventory.ts';
export * from './media.ts';
export * from './operations.ts';
export * from './returns.ts';
export * from './reviews.ts';
export * from './seller-inventory.ts';
export * from './seller-offers.ts';
export * from './seller-orders.ts';
export * from './seller-products.ts';
export * from './seller-fulfillment.ts';
export * from './sellers.ts';
export * from './shipments.ts';
