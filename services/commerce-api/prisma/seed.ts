import { PrismaClient, ProductStatus, Role } from '@prisma/client';
import { isEmail } from 'class-validator';
import { hashPassword } from '../src/modules/auth/password.util';

const prisma = new PrismaClient();

type CatalogSeedCategory = {
  slug: string;
  name: string;
  position: number;
};

type CatalogSeedProduct = {
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  /** Minor units (ngwee) — see the schema's monetary-amount convention. */
  priceMinor: number;
  /** Smaller means more recently "created", for a believable newest-first sort. */
  daysAgo: number;
};

const CATALOG_CATEGORIES: CatalogSeedCategory[] = [
  { slug: 'electronics', name: 'Electronics', position: 0 },
  { slug: 'home-and-living', name: 'Home & Living', position: 1 },
  { slug: 'outdoor-and-apparel', name: 'Outdoor & Apparel', position: 2 },
];

const CATALOG_PRODUCTS: CatalogSeedProduct[] = [
  {
    slug: 'aria-wireless-earbuds',
    name: 'Aria Wireless Earbuds',
    description:
      'True wireless earbuds with active noise cancellation and 30 hours of combined battery life.',
    categorySlug: 'electronics',
    priceMinor: 7900,
    daysAgo: 1,
  },
  {
    slug: 'pulse-fitness-tracker',
    name: 'Pulse Fitness Tracker',
    description:
      'Tracks heart rate, sleep, and workouts, with a 7-day battery and a bright always-on display.',
    categorySlug: 'electronics',
    priceMinor: 9900,
    daysAgo: 2,
  },
  {
    slug: 'drift-bluetooth-speaker',
    name: 'Drift Bluetooth Speaker',
    description:
      'A compact, waterproof speaker with 12 hours of playtime and rich, room-filling sound.',
    categorySlug: 'electronics',
    priceMinor: 5900,
    daysAgo: 3,
  },
  {
    slug: 'orbit-phone-stand',
    name: 'Orbit Phone Stand',
    description:
      'An adjustable aluminum stand that folds flat and fits any phone or small tablet.',
    categorySlug: 'electronics',
    priceMinor: 900,
    daysAgo: 4,
  },
  {
    slug: 'lumen-desk-lamp',
    name: 'Lumen Desk Lamp',
    description:
      'Adjustable LED desk lamp with warm-to-cool color temperature and a built-in USB charging port.',
    categorySlug: 'electronics',
    priceMinor: 4500,
    daysAgo: 5,
  },
  {
    slug: 'aroma-french-press',
    name: 'Aroma French Press',
    description:
      'An 8-cup borosilicate glass French press with a stainless steel filter for full-bodied coffee.',
    categorySlug: 'home-and-living',
    priceMinor: 4200,
    daysAgo: 6,
  },
  {
    slug: 'comfort-memory-pillow',
    name: 'Comfort Memory Pillow',
    description:
      'A contoured memory foam pillow that supports the neck and shoulders for side and back sleepers.',
    categorySlug: 'home-and-living',
    priceMinor: 3800,
    daysAgo: 7,
  },
  {
    slug: 'halo-desk-organizer',
    name: 'Halo Desk Organizer',
    description:
      'A modular bamboo organizer that keeps pens, cables, and notes tidy on any desk.',
    categorySlug: 'home-and-living',
    priceMinor: 1800,
    daysAgo: 8,
  },
  {
    slug: 'ember-scented-candle',
    name: 'Ember Scented Candle',
    description: 'A soy-wax candle with a 45-hour burn time in a warm, woody fragrance.',
    categorySlug: 'home-and-living',
    priceMinor: 1200,
    daysAgo: 9,
  },
  {
    slug: 'glow-skincare-set',
    name: 'Glow Skincare Set',
    description:
      'A three-step routine of cleanser, serum, and moisturizer suited to all skin types.',
    categorySlug: 'home-and-living',
    priceMinor: 6500,
    daysAgo: 10,
  },
  {
    slug: 'nomad-travel-backpack',
    name: 'Nomad Travel Backpack',
    description:
      'A weatherproof 30L backpack with a padded laptop sleeve and a dedicated shoe compartment.',
    categorySlug: 'outdoor-and-apparel',
    priceMinor: 12900,
    daysAgo: 11,
  },
  {
    slug: 'cascade-water-bottle',
    name: 'Cascade Water Bottle',
    description:
      'Insulated stainless steel bottle that keeps drinks cold for 24 hours or hot for 12.',
    categorySlug: 'outdoor-and-apparel',
    priceMinor: 2800,
    daysAgo: 12,
  },
  {
    slug: 'stride-running-shoes',
    name: 'Stride Running Shoes',
    description:
      'Lightweight running shoes with responsive cushioning and a breathable knit upper.',
    categorySlug: 'outdoor-and-apparel',
    priceMinor: 8900,
    daysAgo: 13,
  },
  {
    slug: 'voyage-duffel-bag',
    name: 'Voyage Duffel Bag',
    description:
      'A rugged weekend duffel with a removable shoulder strap and a separate shoe pocket.',
    categorySlug: 'outdoor-and-apparel',
    priceMinor: 5400,
    daysAgo: 14,
  },
  {
    slug: 'flux-yoga-mat',
    name: 'Flux Yoga Mat',
    description:
      'A non-slip, extra-thick yoga mat with alignment lines and a carrying strap included.',
    categorySlug: 'outdoor-and-apparel',
    priceMinor: 2800,
    daysAgo: 15,
  },
  {
    slug: 'solstice-sunglasses',
    name: 'Solstice Sunglasses',
    description:
      'Polarized lenses with 100% UV protection in a lightweight, scratch-resistant frame.',
    categorySlug: 'outdoor-and-apparel',
    priceMinor: 2400,
    daysAgo: 16,
  },
  {
    slug: 'classic-cotton-tee',
    name: 'Classic Cotton Tee',
    description: 'A soft, breathable 100% cotton t-shirt cut for an everyday, true-to-size fit.',
    categorySlug: 'outdoor-and-apparel',
    priceMinor: 2200,
    daysAgo: 17,
  },
  {
    slug: 'everyday-canvas-tote',
    name: 'Everyday Canvas Tote',
    description:
      'A durable canvas tote with reinforced handles and an interior pocket for small essentials.',
    categorySlug: 'outdoor-and-apparel',
    priceMinor: 3400,
    daysAgo: 18,
  },
];

async function seedCatalog(): Promise<void> {
  const categoryIdBySlug = new Map<string, string>();

  for (const category of CATALOG_CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      create: {
        name: category.name,
        slug: category.slug,
        position: category.position,
      },
      update: {},
    });
    categoryIdBySlug.set(category.slug, row.id);
  }

  let created = 0;
  for (const item of CATALOG_PRODUCTS) {
    const existing = await prisma.product.findUnique({
      where: { slug: item.slug },
    });
    if (existing) {
      continue;
    }

    await prisma.product.create({
      data: {
        name: item.name,
        slug: item.slug,
        description: item.description,
        categoryId: categoryIdBySlug.get(item.categorySlug),
        status: ProductStatus.PUBLISHED,
        createdAt: new Date(Date.now() - item.daysAgo * 24 * 60 * 60 * 1000),
        variants: {
          create: {
            skuCode: `${item.slug}-default`,
            status: ProductStatus.PUBLISHED,
            offers: {
              create: {
                status: ProductStatus.PUBLISHED,
                prices: {
                  create: { amount: item.priceMinor, currency: 'ZMW' },
                },
              },
            },
          },
        },
      },
    });
    created += 1;
  }

  console.log(
    `Catalog: ${CATALOG_CATEGORIES.length} categories, ${created} products created (${
      CATALOG_PRODUCTS.length - created
    } already existed).`,
  );
}

async function seedAdmin(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.test')
    .trim()
    .toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'DemoAdmin123!';
  if (
    !isEmail(email) ||
    password.length < 8 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new Error(
      'Seed requires a valid email and a password of at least 8 characters and at most 72 UTF-8 bytes',
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== Role.ADMIN || !existing.isActive) {
      throw new Error(
        'Seed email already belongs to a non-admin or inactive account; choose another SEED_ADMIN_EMAIL',
      );
    }
    console.log(
      `Admin ${email} already exists; password and account unchanged.`,
    );
    return;
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      firstName: 'Demo',
      lastName: 'Admin',
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log(`Created development admin: ${email}`);
}

async function main(): Promise<void> {
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) {
    throw new Error('Seeding requires NODE_ENV=development or test');
  }

  await seedAdmin();
  await seedCatalog();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
