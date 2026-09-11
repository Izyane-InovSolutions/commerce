'use server';

import { revalidatePath } from 'next/cache';

import {
  approveSellerApplication,
  reinstateSeller,
  rejectSellerApplication,
  suspendSeller,
} from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

function revalidateSellers(): void {
  revalidatePath('/sellers');
  revalidatePath('/');
}

export async function approveApplicationAction(
  applicationId: string,
): Promise<FormState> {
  try {
    await approveSellerApplication(apiClient, applicationId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateSellers();
  return { status: 'idle', message: 'Seller approved.' };
}

export async function rejectApplicationAction(
  applicationId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await rejectSellerApplication(
      apiClient,
      applicationId,
      String(formData.get('reason') ?? '').trim(),
    );
  } catch (error) {
    return toFormState(error);
  }

  revalidateSellers();
  return { status: 'idle', message: 'Application rejected.' };
}

export async function setSellerStatusAction(
  sellerId: string,
  suspend: boolean,
): Promise<FormState> {
  try {
    await (suspend
      ? suspendSeller(apiClient, sellerId)
      : reinstateSeller(apiClient, sellerId));
  } catch (error) {
    return toFormState(error);
  }

  revalidateSellers();
  return {
    status: 'idle',
    message: suspend ? 'Seller suspended.' : 'Seller reinstated.',
  };
}
