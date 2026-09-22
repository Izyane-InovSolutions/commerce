import { redirect } from 'next/navigation';

/**
 * Orders now live on the account page's Orders tab, not their own route —
 * this exists only so an old bookmark or link still lands somewhere useful,
 * carrying over the "just placed" reference if it had one.
 */
export default async function OrdersPage({
  searchParams,
}: PageProps<'/orders'>) {
  const { placed } = await searchParams;
  const query = typeof placed === 'string' ? `&placed=${placed}` : '';
  redirect(`/account?tab=orders${query}`);
}
