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
  options: {
    code: string;
    name: string;
    values: OptionValue[];
    /** Attached to the category as optional rather than required. */
    optional?: boolean;
  }[];
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
  'iphone-18-pro': {
    product: {
      name: 'iPhone 18 Pro',
      slug: 'iphone-18-pro',
      description:
        'Demo listing with colour, storage and carrier combinations. Each combination is created as its own variant with its own SKU, price and stock.',
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
          { value: '256GB', sku: '256', surcharge: 0 },
          { value: '512GB', sku: '512', surcharge: 3_000_00 },
          { value: '1TB', sku: '1TB', surcharge: 7_000_00 },
        ],
      },
      {
        code: 'carrier',
        name: 'Carrier',
        values: CARRIERS,
      },
    ],
    soldOut: ['IP18P-BLU-1TB-UNL', 'IP18P-SLV-512-VZW'],
  },

  'pixel-11-pro': {
    product: {
      name: 'Google Pixel 11 Pro',
      slug: 'google-pixel-11-pro',
      description:
        'Demo Google Pixel 11 Pro listing with colour, storage and carrier combinations, individually priced and stocked.',
    },
    category: { name: 'Smartphones', slug: 'smartphones' },
    brand: { name: 'Google', slug: 'google' },
    skuPrefix: 'PX11P',
    basePrice: 21_999_00,
    options: [
      {
        code: 'color',
        name: 'Color',
        values: [
          { value: 'Obsidian', sku: 'OBS', surcharge: 0 },
          { value: 'Porcelain', sku: 'POR', surcharge: 0 },
          { value: 'Hazel', sku: 'HAZ', surcharge: 0 },
        ],
      },
      {
        code: 'storage',
        name: 'Storage',
        values: [
          { value: '256GB', sku: '256', surcharge: 0 },
          { value: '512GB', sku: '512', surcharge: 3_500_00 },
          { value: '1TB', sku: '1TB', surcharge: 8_000_00 },
        ],
      },
      {
        code: 'carrier',
        name: 'Carrier',
        values: CARRIERS,
      },
    ],
    soldOut: ['PX11P-HAZ-1TB-UNL', 'PX11P-POR-512-VZW'],
  },

  'pixel-11-pro-xl': {
    product: {
      name: 'Google Pixel 11 Pro XL',
      slug: 'google-pixel-11-pro-xl',
      description:
        'Demo Google Pixel 11 Pro XL listing with colour, storage and carrier combinations, individually priced and stocked.',
    },
    category: { name: 'Smartphones', slug: 'smartphones' },
    brand: { name: 'Google', slug: 'google' },
    skuPrefix: 'PX11PXL',
    basePrice: 23_999_00,
    options: [
      {
        code: 'color',
        name: 'Color',
        values: [
          { value: 'Obsidian', sku: 'OBS', surcharge: 0 },
          { value: 'Porcelain', sku: 'POR', surcharge: 0 },
          { value: 'Hazel', sku: 'HAZ', surcharge: 0 },
        ],
      },
      {
        code: 'storage',
        name: 'Storage',
        values: [
          { value: '256GB', sku: '256', surcharge: 0 },
          { value: '512GB', sku: '512', surcharge: 3_500_00 },
          { value: '1TB', sku: '1TB', surcharge: 8_000_00 },
        ],
      },
      {
        code: 'carrier',
        name: 'Carrier',
        values: CARRIERS,
      },
    ],
    soldOut: ['PX11PXL-HAZ-1TB-UNL', 'PX11PXL-OBS-512-ATT'],
  },

  'galaxy-s26-ultra': {
    product: {
      name: 'Samsung Galaxy S26 Ultra',
      slug: 'samsung-galaxy-s26-ultra',
      description:
        'Demo Samsung Galaxy S26 Ultra listing with colour, storage and carrier combinations, individually priced and stocked.',
    },
    category: { name: 'Smartphones', slug: 'smartphones' },
    brand: { name: 'Samsung', slug: 'samsung' },
    skuPrefix: 'GS26U',
    basePrice: 22_999_00,
    options: [
      {
        code: 'color',
        name: 'Color',
        values: [
          { value: 'Titanium Black', sku: 'BLK', surcharge: 0 },
          { value: 'Titanium Silver', sku: 'SLV', surcharge: 0 },
          { value: 'Titanium Blue', sku: 'BLU', surcharge: 0 },
          { value: 'Titanium Gray', sku: 'GRY', surcharge: 0 },
        ],
      },
      {
        code: 'storage',
        name: 'Storage',
        values: [
          { value: '256GB', sku: '256', surcharge: 0 },
          { value: '512GB', sku: '512', surcharge: 3_500_00 },
          { value: '1TB', sku: '1TB', surcharge: 8_000_00 },
          { value: '2TB', sku: '2TB', surcharge: 13_000_00 },
        ],
      },
      {
        code: 'carrier',
        name: 'Carrier',
        values: CARRIERS,
      },
    ],
    soldOut: ['GS26U-BLU-2TB-UNL', 'GS26U-GRY-1TB-TMO'],
  },
};

let token = '';

async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
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

type CategoryAttribute = {
  attributeId: string;
  code: string;
  isRequired: boolean;
  inheritedFrom: Id | null;
};

/**
 * Attaches the listing's options to its category (required unless marked
 * optional), so variants in it are held to them. Keeps whatever the category
 * already has attached; one inherited from a parent is left to the parent.
 * A backend without category attributes just gets a warning.
 */
async function attachToCategory(
  categoryId: string,
  listing: Listing,
  valueIds: Map<string, Map<string, string>>,
): Promise<void> {
  let current: CategoryAttribute[];
  try {
    current = await api<CategoryAttribute[]>(
      'GET',
      `/admin/catalog/categories/${categoryId}/attributes`,
    );
  } catch (error) {
    console.warn(
      `  (category attributes not supported by this API, skipped: ${
        error instanceof Error ? error.message : String(error)
      })`,
    );
    return;
  }

  const own = current.filter((entry) => entry.inheritedFrom === null);
  const known = new Set(current.map((entry) => entry.code));
  const additions = listing.options.filter((option) => !known.has(option.code));
  if (additions.length === 0) return;

  const attributeIdByCode = new Map<string, string>();
  for (const option of additions) {
    const detail = rows<Attribute>(
      await api('GET', '/admin/catalog/attributes'),
    ).find((row) => row.code === option.code);
    if (detail && valueIds.has(option.code))
      attributeIdByCode.set(option.code, detail.id);
  }

  await api('PUT', `/admin/catalog/categories/${categoryId}/attributes`, {
    attributes: [
      ...own.map(({ attributeId, isRequired }) => ({ attributeId, isRequired })),
      ...additions.map((option) => ({
        attributeId: attributeIdByCode.get(option.code)!,
        isRequired: !option.optional,
      })),
    ],
  });
  console.log(
    `  attached ${additions.map((option) => option.name).join(', ')} to ${listing.category.name}`,
  );
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
  const key = process.env.LISTING ?? 'iphone-18-pro';
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

  await attachToCategory(category.id, listing, valueIds);

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
