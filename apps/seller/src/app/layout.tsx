import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { DashboardShell } from '@/components/dashboard-shell';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Commerce Seller',
    template: '%s | Commerce Seller',
  },
  description:
    'Manage your offers, inventory, orders, fulfillment, and earnings on the Commerce Platform.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
