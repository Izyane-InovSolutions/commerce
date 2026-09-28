'use server';

import { revalidatePath } from 'next/cache';

import {
  backendAddAttributeValue,
  backendCreateAttribute,
  backendDeleteAttribute,
  backendDeleteAttributeValue,
  backendUpdateAttribute,
  backendUpdateAttributeValue,
} from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import { guardAction } from '@/lib/session';

/**
 * Attributes feed the variant pickers on every product page as well as this
 * one, so a change revalidates the whole catalog section, not just the list.
 */
function revalidateAttributes(): void {
  revalidatePath('/catalog', 'layout');
}

export async function createAttributeAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendCreateAttribute(apiClient, {
      name: String(formData.get('name') ?? '').trim(),
      code: String(formData.get('code') ?? '').trim(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateAttributes();
  return { status: 'idle', message: 'Attribute added.' };
}

export async function updateAttributeAction(
  attributeId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendUpdateAttribute(apiClient, attributeId, {
      name: String(formData.get('name') ?? '').trim(),
      code: String(formData.get('code') ?? '').trim(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateAttributes();
  return { status: 'idle', message: 'Saved.' };
}

/** Takes every value with it, and those values off every variant. */
export async function deleteAttributeAction(
  attributeId: string,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendDeleteAttribute(apiClient, attributeId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateAttributes();
  return { status: 'idle', message: 'Attribute deleted.' };
}

export async function addAttributeValueAction(
  attributeId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendAddAttributeValue(apiClient, attributeId, {
      value: String(formData.get('value') ?? '').trim(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateAttributes();
  return { status: 'idle', message: 'Value added.' };
}

export async function updateAttributeValueAction(
  attributeId: string,
  valueId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendUpdateAttributeValue(apiClient, attributeId, valueId, {
      value: String(formData.get('value') ?? '').trim(),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateAttributes();
  return { status: 'idle', message: 'Saved.' };
}

/** Takes the value off every variant that carried it. */
export async function deleteAttributeValueAction(
  attributeId: string,
  valueId: string,
): Promise<FormState> {
  const denied = await guardAction();
  if (denied) {
    return denied;
  }

  try {
    await backendDeleteAttributeValue(apiClient, attributeId, valueId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateAttributes();
  return { status: 'idle', message: 'Value deleted.' };
}
