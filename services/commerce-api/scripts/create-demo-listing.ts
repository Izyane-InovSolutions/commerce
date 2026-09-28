/*
 * Creates one fully-optioned demo listing through the admin API: an
 * "iPhone 18 Pro" in every Color × Storage × Carrier combination, each variant
 * with its attribute values, a published offer, a ZMW price and stock.
 *
 * It goes through the HTTP API (not Prisma) so every write is validated the
 * same way the admin portal's would be. Attributes, values, the category and
 * the brand are reused when they already exist; the product itself is not —
 * a second run stops at the slug conflict instead of duplicating anything.
 *
 *   API_URL=http://localhost:3005/api/v1 \
 *   ADMIN_EMAIL=admin@example.test ADMIN_PASSWORD=... \
 *   npx ts-node scripts/create-demo-listing.ts
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

const PRODUCT = {
  name: 'iPhone 18 Pro',
  slug: 'iphone-18-pro',
  description:
    'Demo listing with every colour, storage and carrier combination as its own variant, priced and stocked individually.',
};

/** Each option carries its SKU segment and what it adds to the base price. */
const OPTIONS = {
  color: {
    name: 'Color',
    values: [
      { value: 'Black', sku: 'BLK', surcharge: 0 },
      { value: 'Silver', sku: 'SLV', surcharge: 0 },
      { value: 'Deep Blue', sku: 'BLU', surcharge: 0 },
    ],
  },
  storage: {
    name: 'Storage',
    values: [
      { value: '128GB', sku: '128', surcharge: 0 },
      { value: '256GB', sku: '256', surcharge: 3_000_00 },
      { value: '512GB', sku: '512', surcharge: 7_000_00 },
    ],
  },
  carrier: {
    name: 'Carrier',
    values: [
      { value: 'Unlocked', sku: 'UNL', surcharge: 0 },
      // Carrier-locked units sell for less than unlocked ones.
      { value: 'Sprint', sku: 'SPR', surcharge: -1_500_00 },
      { value: 'Verizon', sku: 'VZW', surcharge: -1_500_00 },
    ],
  },
} as const;

const BASE_PRICE = 24_999_00; // K 24,999.00, in ngwee

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
  listPath: string,
  createPath: string,
  match: (row: T) => boolean,
  input: object,
): Promise<T> {
  const existing = rows<T>(await api('GET', listPath)).find(match);
  return existing ?? api<T>('POST', createPath, input);
}

async function ensureAttribute(
  code: string,
  name: string,
  values: readonly string[],
): Promise<Map<string, string>> {
  const attributes = rows<Attribute>(
    await api('GET', '/admin/catalog/attributes'),
  );
  const attribute =
    attributes.find((row) => row.code === code) ??
    (await api<Attribute>('POST', '/admin/catalog/attributes', { name, code }));
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

async function main(): Promise<void> {
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
    throw new Error('Create a warehouse first — stock has to be received into one.');
  }

  const category = await findOrCreate<Id & { slug: string }>(
    '/admin/catalog/categories',
    '/admin/catalog/categories',
    (row) => row.slug === 'smartphones',
    { name: 'Smartphones', slug: 'smartphones' },
  );
  const brand = await findOrCreate<Id & { slug: string }>(
    '/admin/catalog/brands',
    '/admin/catalog/brands',
    (row) => row.slug === 'apple',
    { name: 'Apple', slug: 'apple' },
  );

  const valueIds = {
    color: await ensureAttribute(
      'color',
      OPTIONS.color.name,
      OPTIONS.color.values.map((option) => option.value),
    ),
    storage: await ensureAttribute(
      'storage',
      OPTIONS.storage.name,
      OPTIONS.storage.values.map((option) => option.value),
    ),
    carrier: await ensureAttribute(
      'carrier',
      OPTIONS.carrier.name,
      OPTIONS.carrier.values.map((option) => option.value),
    ),
  };

  const product = await api<Id>('POST', '/admin/catalog/products', {
    ...PRODUCT,
    categoryId: category.id,
    brandId: brand.id,
  });

  let created = 0;
  for (const color of OPTIONS.color.values) {
    for (const storage of OPTIONS.storage.values) {
      for (const carrier of OPTIONS.carrier.values) {
        const skuCode = `IP18P-${color.sku}-${storage.sku}-${carrier.sku}`;
        const variant = await api<Id>(
          'POST',
          `/admin/catalog/products/${product.id}/variants`,
          {
            skuCode,
            name: `${color.value} / ${storage.value} / ${carrier.value}`,
            attributeValueIds: [
              valueIds.color.get(color.value),
              valueIds.storage.get(storage.value),
              valueIds.carrier.get(carrier.value),
            ],
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
        await api('POST', `/admin/catalog/offers/${offer.id}/prices`, {
          amount:
            BASE_PRICE + color.surcharge + storage.surcharge + carrier.surcharge,
          currency: CURRENCY,
        });
        await api('PATCH', `/admin/catalog/offers/${offer.id}/status`, {
          status: 'PUBLISHED',
        });

        // Varied so low-stock and sold-out states show up across the grid.
        const quantity = 4 + ((created * 7) % 9);
        await api('POST', '/admin/inventory/receive', {
          warehouseId: warehouse.id,
          variantId: variant.id,
          quantity,
          note: 'Demo listing opening stock',
        });

        created += 1;
        console.log(`  ${skuCode}  ×${quantity}`);
      }
    }
  }

  await api('PATCH', `/admin/catalog/products/${product.id}/status`, {
    status: 'PUBLISHED',
  });

  console.log(
    `\nCreated ${PRODUCT.name} (${product.id}) with ${created} variants in ${warehouse.name}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
