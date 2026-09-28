import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DEFAULT_RETURN_WINDOW_DAYS } from '@/lib/catalog-types';
import { ORDER_CURRENCY } from '@/lib/payment-methods';

export const metadata: Metadata = {
  title: 'Help & Support',
};

/**
 * Every answer here is written against what the platform actually does —
 * the payment methods checkout offers, the shipping policy the API quotes,
 * and the returns module's eligibility rules — so it needs revisiting when
 * those change, not just when the copy does.
 */
const SECTIONS = [
  { id: 'ordering', title: 'Ordering' },
  { id: 'payment', title: 'Payment' },
  { id: 'shipping', title: 'Shipping & delivery' },
  { id: 'returns', title: 'Returns & refunds' },
  { id: 'account', title: 'Your account' },
] as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-20 space-y-3"
    >
      <h2 id={`${id}-heading`} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <div className="text-muted-foreground space-y-3 text-sm leading-relaxed text-pretty [&_a]:text-foreground [&_a]:underline [&_strong]:text-foreground [&_strong]:font-medium">
        {children}
      </div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-10 md:grid-cols-[12rem_1fr]">
        <nav aria-label="Help topics" className="md:sticky md:top-20 md:self-start">
          <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Topics
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm md:flex-col">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="hover:text-foreground text-muted-foreground"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-2xl space-y-10">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Help & Support
            </h1>
            <p className="text-muted-foreground text-pretty">
              How buying on iZyane Marketplace works, from checkout to
              returns.
            </p>
          </div>

          <Section id="ordering" title="Ordering">
            <p>
              Add products to your <Link href="/cart">cart</Link> and check
              out, or use <strong>Buy now</strong> on a product page to check
              out with just that item. Some products are sold by iZyane and
              others by independent sellers; a single order can include
              both.
            </p>
            <p>
              You can fill a cart without an account. When you sign in, what
              you added is moved into your own cart.
            </p>
            <p>
              Your orders are listed under{' '}
              <Link href="/account?tab=orders">Account → Orders</Link>, with
              their payment status and, once they ship, their delivery
              progress.
            </p>
          </Section>

          <Section id="payment" title="Payment">
            <p>
              Prices and orders are in {ORDER_CURRENCY} (Zambian Kwacha). At
              checkout you can pay with:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Mobile money</strong> — MTN or Airtel. You’ll get a
                prompt on your phone to approve the payment.
              </li>
              <li>
                <strong>Card</strong> — your bank may ask you to confirm the
                payment on its own page before you’re brought back here.
              </li>
            </ul>
            <p>
              An order shows as <strong>Awaiting payment</strong> until the
              payment is confirmed, and updates on its own once it is. If a
              payment fails, the order says why.
            </p>
            <p>
              An order that hasn’t been paid can be cancelled. Once it’s paid
              it can’t be cancelled — it’s refunded instead.
            </p>
          </Section>

          <Section id="shipping" title="Shipping & delivery">
            <p>
              Shipping is worked out at checkout from your delivery address
              and shown before you pay. Deliveries within Zambia cost less
              than international ones, and orders within Zambia over a set
              amount ship free. Some countries can’t be delivered to; checkout
              tells you if yours is one of them.
            </p>
            <p>
              An order with items from several sellers may arrive in more
              than one delivery. Each order’s shipping status shows when it
              has been packed, shipped and delivered.
            </p>
            <p>
              Save your addresses under{' '}
              <Link href="/account?tab=addresses">Account → My addresses</Link>{' '}
              so checkout can fill them in for you.
            </p>
          </Section>

          <Section id="returns" title="Returns & refunds">
            <p>
              Most items can be returned within{' '}
              <strong>{DEFAULT_RETURN_WINDOW_DAYS} days of delivery</strong>.
              Some products have a different return window, and some can’t
              be returned at all — each product page says which applies to
              it.
            </p>
            <p>A return can be requested when:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>the item has been delivered,</li>
              <li>its return window hasn’t closed, and</li>
              <li>it isn’t already part of another open return.</li>
            </ul>
            <p>
              When you ask for a return, you choose which items and how many,
              and tell us why — for example it arrived damaged, is defective,
              is the wrong item, isn’t as described, doesn’t fit, or you’ve
              changed your mind.
            </p>
            <p>
              Once a return is approved, you send the item back. When it’s
              received and inspected, the refund is issued to the payment
              method you paid with. You can follow each step on your{' '}
              <Link href="/returns">returns</Link> page.
            </p>
          </Section>

          <Section id="account" title="Your account">
            <p>
              Update your name and phone number, or change your password,
              under <Link href="/account?tab=settings">Account → Settings</Link>
              . Changing your password signs you out on every other device.
            </p>
            <p>
              Forgotten your password? Use{' '}
              <Link href="/forgot-password">reset your password</Link> and
              we’ll email you a link that works for one hour.
            </p>
            <p>
              Want to sell on iZyane? Choose <strong>Become a seller</strong>{' '}
              on your <Link href="/account">account page</Link> to apply.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
