import Image from 'next/image';

import heroImage from '@/assets/hero1.png';
import { ProductCategorySection } from '@/components/product-category-section';
import { SideNav } from '@/components/side-nav';
import { productCategories } from '@/lib/mock-data/products';

export default function HomePage() {
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

        {productCategories.map((category) => (
          <ProductCategorySection key={category.slug} category={category} />
        ))}
      </div>
    </div>
  );
}
