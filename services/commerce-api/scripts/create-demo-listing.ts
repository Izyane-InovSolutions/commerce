/*
 * Creates a fully-optioned demo listing through the admin API: one product in
 * every combination of its options (e.g. Color × Storage × Carrier), each
 * variant with its attribute values, a published offer, a ZMW price and stock.
 * Meant as a worked example of how a multi-option product is modelled.
 *
 * It goes through the HTTP API (not Prisma) so every write is validated the
 * same way the admin portal's would be. Attributes, values, the category and
 * the brand are reused when they already exist; the product itself is not —
 * a second run stops at the slug conflict instead of duplicating anything.
 *
 *   LISTING=iphone-18-pro-max \
 *   API_URL=http://localhost:3005/api/v1 \
 *   ADMIN_EMAIL=admin@example.test ADMIN_PASSWORD=... \
 *   npx ts-node --transpile-only scripts/create-demo-listing.ts
 */

const API_URL = (process.env.API_URL ?? 'http://localhost:3005/api/v1').replace(
  /\/+$/,
  '',
);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'DemoAdmin123!';
const CURRENCY = 'ZMW';

type Id = { id: string };
type Attribute = Id & { code: string; values?: (Id & { value: string })[] };

/** One choosable value: its SKU segment and what it adds to the base price
 * (negative for cheaper, e.g. carrier-locked). Amounts are in ngwee. */
type OptionValue = { value: string; sku: string; surcharge: number };

type Listing = {
  product: { name: string; slug: string; description: string };
  category: { name: string; slug: string };
  brand: { name: string; slug: string };
  skuPrefix: string;
  basePrice: number;
  /** In picker order; every combination becomes one variant. `code` is the
   * shared attribute (reused across products), `name` its label. */
  options: { code: string; name: string; values: OptionValue[] }[];
  /** Variants published with a price but no stock, to show sold-out states. */
  soldOut?: string[];
};

const CARRIERS: OptionValue[] = [
  { value: 'Unlocked', sku: 'UNL', surcharge: 0 },
  // Carrier-locked units sell for less than unlocked ones.
  { value: 'AT&T', sku: 'ATT', surcharge: -1_500_00 },
  { value: 'T-Mobile', sku: 'TMO', surcharge: -1_500_00 },
  { value: 'Verizon', sku: 'VZW', surcharge: -1_500_00 },
];

const LISTINGS: Record<string, Listing> = {
  // Colours and capacities as announced by Apple (September 2026).
  'iphone-18-pro-max': {
    product: {
      name: 'iPhone 18 Pro Max',
      slug: 'iphone-18-pro-max',
      description:
        'Guide listing: every colour, storage and carrier combination is its own variant with its own SKU, price and stock. Storage and carrier change the price; colour does not. Two combinations are deliberately out of stock.',
    },
    category: { name: 'Smartphones', slug: 'smartphones' },
    brand: { name: 'Apple', slug: 'apple' },
    skuPrefix: 'IP18PM',
    basePrice: 32_999_00, // K 32,999.00
    options: [
      {
        code: 'color',
        name: 'Color',
        values: [
          { value: 'Black', sku: 'BLK', surcharge: 0 },
          { value: 'Silver', sku: 'SLV', surcharge: 0 },
          { value: 'Burgundy', sku: 'BRG', surcharge: 0 },
          { value: 'Glacier', sku: 'GLC', surcharge: 0 },
        ],
      },
      {
        code: 'storage',
        name: 'Storage',
        values: [
          { value: '256GB', sku: '256', surcharge: 0 },
          { value: '512GB', sku: '512', surcharge: 5_000_00 },
          { value: '1TB', sku: '1TB', surcharge: 11_000_00 },
          { value: '2TB', sku: '2TB', surcharge: 20_000_00 },
        ],
      },
      { code: 'carrier', name: 'Carrier', values: CARRIERS },
    ],
    soldOut: ['IP18PM-BRG-2TB-UNL', 'IP18PM-GLC-1TB-VZW'],
  },
  // The first demo, kept so the script documents what it created.
  'iphone-18-pro': {
    product: {
      name: 'iPhone 18 Pro',
      slug: 'iphone-18-pro',
      description:
        'Demo listing with every colour, storage and carrier combination as its own variant, priced and stocked individually.',
    },
    category: { name: 'Smartphones', slug: 'smartphones' },
    brand: { name: 'Apple', slug: 'apple' },
    skuPrefix: 'IP18P',
    basePrice: 24_999_00,
    options: [
      {
        code: 'color',
        name: 'Color',
        values: [
          { value: 'Black', sku: 'BLK', surcharge: 0 },
          { value: 'Silver', sku: 'SLV', surcharge: 0 },
          { value: 'Deep Blue', sku: 'BLU', surcharge: 0 },
        ],
      },
      {
        code: 'storage',
        name: 'Storage',
        values: [
          { value: '128GB', sku: '128', surcharge: 0 },
          { value: '256GB', sku: '256', surcharge: 3_000_00 },
          { value: '512GB', sku: '512', surcharge: 7_000_00 },
        ],
      },
      {
        code: 'carrier',
        name: 'Carrier',
        values: [
          { value: 'Unlocked', sku: 'UNL', surcharge: 0 },
          { value: 'Sprint', sku: 'SPR', surcharge: -1_500_00 },
          { value: 'Verizon', sku: 'VZW', surcharge: -1_500_00 },
        ],
      },
    ],
  },
};

let token = '';

async function api<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as { data?: T; error?: unknown }) : {};
  if (!response.ok) {
    throw new Error(
      `${method} ${path} → ${response.status}: ${JSON.stringify(json.error ?? json)}`,
    );
  }
  return json.data as T;
}

/** Unwraps whichever list shape a route returns: a bare array, `{ items }`
 * or `{ data }`. */
function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const page = result as { items?: T[]; data?: T[] };
  return page.items ?? page.data ?? [];
}

async function findOrCreate<T extends Id>(
  path: string,
  match: (row: T) => boolean,
  input: object,
): Promise<T> {
  const existing = rows<T>(await api('GET', path)).find(match);
  return existing ?? api<T>('POST', path, input);
}

async function ensureAttribute(
  code: string,
  name: string,
  values: string[],
): Promise<Map<string, string>> {
  const attribute = await findOrCreate<Attribute>(
    '/admin/catalog/attributes',
    (row) => row.code === code,
    { name, code },
  );
  const detail = await api<Attribute>(
    'GET',
    `/admin/catalog/attributes/${attribute.id}`,
  );

  const ids = new Map<string, string>();
  for (const value of values) {
    const found = detail.values?.find((row) => row.value === value);
    const created =
      found ??
      (await api<Id>('POST', `/admin/catalog/attributes/${attribute.id}/values`, {
        value,
      }));
    ids.set(value, created.id);
  }
  return ids;
}

/** Every combination of one value per option, in picker order. */
function combinations(options: Listing['options']): OptionValue[][] {
  return options.reduce<OptionValue[][]>(
    (combos, option) =>
      combos.flatMap((combo) => option.values.map((value) => [...combo, value])),
    [[]],
  );
}

async function main(): Promise<void> {
  const key = process.env.LISTING ?? 'iphone-18-pro-max';
  const listing = LISTINGS[key];
  if (!listing) {
    throw new Error(
      `Unknown LISTING "${key}". Choose one of: ${Object.keys(LISTINGS).join(', ')}`,
    );
  }

  token = (
    await api<{ accessToken: string }>('POST', '/auth/login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    })
  ).accessToken;

  const warehouse = rows<Id & { name: string }>(
    await api('GET', '/admin/inventory/warehouses'),
  )[0];
  if (!warehouse) {
    throw new Error(
      'Create a warehouse first — stock has to be received into one.',
    );
  }

  const category = await findOrCreate<Id & { slug: string }>(
    '/admin/catalog/categories',
    (row) => row.slug === listing.category.slug,
    listing.category,
  );
  const brand = await findOrCreate<Id & { slug: string }>(
    '/admin/catalog/brands',
    (row) => row.slug === listing.brand.slug,
    listing.brand,
  );

  const valueIds = new Map<string, Map<string, string>>();
  for (const option of listing.options) {
    valueIds.set(
      option.code,
      await ensureAttribute(
        option.code,
        option.name,
        option.values.map((value) => value.value),
      ),
    );
  }

  const product = await api<Id>('POST', '/admin/catalog/products', {
    ...listing.product,
    categoryId: category.id,
    brandId: brand.id,
  });

  let created = 0;
  for (const combo of combinations(listing.options)) {
    const skuCode = [listing.skuPrefix, ...combo.map((value) => value.sku)].join(
      '-',
    );
    const variant = await api<Id>(
      'POST',
      `/admin/catalog/products/${product.id}/variants`,
      {
        skuCode,
        name: combo.map((value) => value.value).join(' / '),
        attributeValueIds: combo.map(
          (value, index) =>
            valueIds.get(listing.options[index]!.code)!.get(value.value)!,
        ),
      },
    );
    await api(
      'PATCH',
      `/admin/catalog/products/${product.id}/variants/${variant.id}/status`,
      { status: 'PUBLISHED' },
    );

    const offer = await api<Id>('POST', '/admin/catalog/offers', {
      variantId: variant.id,
    });
    const amount = combo.reduce(
      (total, value) => total + value.surcharge,
      listing.basePrice,
    );
    await api('POST', `/admin/catalog/offers/${offer.id}/prices`, {
      amount,
      currency: CURRENCY,
    });
    await api('PATCH', `/admin/catalog/offers/${offer.id}/status`, {
      status: 'PUBLISHED',
    });

    // Varied so low-stock and sold-out states show up across the grid.
    const quantity = listing.soldOut?.includes(skuCode)
      ? 0
      : 3 + ((created * 7) % 10);
    if (quantity > 0) {
      await api('POST', '/admin/inventory/receive', {
        warehouseId: warehouse.id,
        variantId: variant.id,
        quantity,
        note: 'Demo listing opening stock',
      });
    }

    created += 1;
    console.log(
      `  ${skuCode.padEnd(22)} K ${(amount / 100).toLocaleString('en-ZM')}  ${
        quantity > 0 ? `×${quantity}` : 'sold out'
      }`,
    );
  }

  await api('PATCH', `/admin/catalog/products/${product.id}/status`, {
    status: 'PUBLISHED',
  });

  console.log(
    `\nCreated ${listing.product.name} (${product.id}) with ${created} variants in ${warehouse.name}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
