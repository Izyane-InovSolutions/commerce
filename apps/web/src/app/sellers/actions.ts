'use server';

import { revalidatePath } from 'next/cache';

import { toFormState, type FormState } from '@/lib/form';
import { saveSeller, unsaveSeller } from '@/lib/saved-sellers';

export async function saveSellerAction(sellerId: string): Promise<FormState> {
  try {
    await saveSeller(sellerId);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/account');
  return { status: 'idle', message: 'Saved.' };
}

export async function unsaveSellerAction(
  sellerId: string,
): Promise<FormState> {
  try {
    await unsaveSeller(sellerId);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/account');
  return { status: 'idle', message: 'Removed.' };
}
