import type { Metadata } from 'next';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { OrderSignInPrompt } from '@/components/order-sign-in-prompt';
import { labelReturnItems, ReturnsList } from '@/components/returns-list';
import { labelOffers, type OfferLabel } from '@/lib/cart';
import { listOrders } from '@/lib/orders';
import { listReturns } from '@/lib/returns';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Returns',
};

/**
 * Best-effort: a list of returns is still useful with "Item" where a name
 * would be.
 */
async function loadItemLabels(): Promise<Map<string, OfferLabel>> {
  try {
    const orders = await listOrders();
    const labels = await labelOffers(
      orders.flatMap((order) => order.items.map((item) => item.offerId)),
    );
    return labelReturnItems(orders, labels);
  } catch {
    return new Map();
  }
}

export default async function ReturnsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <OrderSignInPrompt
        title="Returns"
        message="Sign in to see the returns you’ve requested."
      />
    );
  }

  let returns;
  let labels;

  try {
    [returns, labels] = await Promise.all([listReturns(), loadItemLabels()]);
  } catch (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
      <ReturnsList returns={returns} itemLabels={labels} />
    </div>
  );
}
