import Image from 'next/image';

import heroImage from '@/assets/hero1.png';
import {
  ProductCategorySection,
  type ProductSection,
} from '@/components/product-category-section';
import { SideNav } from '@/components/side-nav';
import { listProducts } from '@/lib/catalog';

const HOMEPAGE_CATEGORIES = [
  { slug: 'electronics', title: 'Electronics' },
  { slug: 'home-and-living', title: 'Home & Living' },
  { slug: 'outdoor-and-apparel', title: 'Outdoor & Apparel' },
] as const;

async function getHomepageSections(): Promise<ProductSection[]> {
  try {
    const sections = await Promise.all(
      HOMEPAGE_CATEGORIES.map(async (category) => {
        const { products } = await listProducts({
          categorySlug: category.slug,
          sort: 'createdAt:desc',
          limit: 8,
        });
        return { slug: category.slug, title: category.title, products };
      }),
    );

    return sections.filter((section) => section.products.length > 0);
  } catch {
    // The catalog API may be unreachable or unseeded; show an empty
    // storefront rather than crashing the homepage.
    return [];
  }
}

export default async function HomePage() {
  const sections = await getHomepageSections();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:flex-row">
      <SideNav />

      <div className="min-w-0 flex-1 space-y-10">
        <section className="flex items-center gap-6 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#2563eb_0%,#1e3a8a_100%)] px-6 py-10 text-white sm:px-10">
          <div className="min-w-0 flex-1 space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              Discover Something New.
            </h1>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="white"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>High-quality products</span>
              </li>
              <li className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="white"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Fast and reliable checkout</span>
              </li>
              <li className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="white"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Excellent customer service</span>
              </li>
            </ul>
          </div>
          <Image
            src={heroImage}
            alt=""
            priority
            className="hidden h-auto w-48 shrink-0 sm:block md:w-64"
          />
        </section>

        {sections.length > 0 ? (
          sections.map((section) => (
            <ProductCategorySection key={section.slug} category={section} />
          ))
        ) : (
          <p className="text-muted-foreground text-sm">
            Products aren&apos;t available right now — check back soon.
          </p>
        )}
      </div>
    </div>
  );
}
