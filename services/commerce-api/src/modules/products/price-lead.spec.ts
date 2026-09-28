import { withPriceLeads } from './price-lead';

type TestOffer = {
  id: string;
  currentPrice: { amount: number; currency: string } | null;
  inStock: boolean;
};

const offer = (
  amount: number | null,
  inStock = true,
  currency = 'ZMW',
): TestOffer => ({
  id: `o${amount}`,
  currentPrice: amount === null ? null : { amount, currency },
  inStock,
});

describe('withPriceLeads', () => {
  it('marks the cheapest in-stock offer when it beats the next by 5% or more', () => {
    const [cheap, dear] = withPriceLeads([offer(9_000), offer(10_000)]);
    expect(cheap!.priceLead).toEqual({
      nextLowestPrice: { amount: 10_000, currency: 'ZMW' },
      sellerCount: 2,
    });
    expect(dear!.priceLead).toBeNull();
  });

  it('marks nothing for a gap under the threshold', () => {
    expect(
      withPriceLeads([offer(9_600), offer(10_000)]).every(
        (entry) => entry.priceLead === null,
      ),
    ).toBe(true);
  });

  it('compares with the next *in-stock* seller and ignores unpriced offers', () => {
    const marked = withPriceLeads([
      offer(8_000),
      offer(8_100, false),
      offer(null),
      offer(10_000),
    ]);
    expect(marked[0]!.priceLead?.nextLowestPrice.amount).toBe(10_000);
  });

  it('needs a second seller to compare with', () => {
    expect(withPriceLeads([offer(1)])[0]!.priceLead).toBeNull();
  });

  it('does not compare across currencies', () => {
    expect(
      withPriceLeads([offer(1), offer(10_000, true, 'USD')])[0]!.priceLead,
    ).toBeNull();
  });
});
