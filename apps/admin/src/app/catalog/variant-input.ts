import type {
  BackendCreateVariantInput,
  BackendUpdateVariantInput,
} from '@commerce/contracts';

/**
 * Reads a variant form.
 *
 * The form renders one select per attribute, all named `attributeValueIds`,
 * and a hidden `attributesShown` marker. The marker matters on an edit: the
 * API *replaces* a variant's values whenever `attributeValueIds` is sent, so
 * a form rendered without the pickers (because the attribute list could not
 * be read) must leave the field out rather than send an empty set and wipe
 * what the variant already carries.
 */
function attributeValueIds(formData: FormData): string[] | undefined {
  if (formData.get('attributesShown') !== '1') {
    return undefined;
  }

  const ids = formData
    .getAll('attributeValueIds')
    .map((value) => String(value).trim())
    .filter((value) => value !== '');
  return [...new Set(ids)];
}

export function variantCreateInput(
  formData: FormData,
): BackendCreateVariantInput {
  const name = String(formData.get('name') ?? '').trim();
  const ids = attributeValueIds(formData);

  return {
    skuCode: String(formData.get('skuCode') ?? '').trim(),
    name: name === '' ? undefined : name,
    // Nothing to replace on a new variant, so an empty set is left out too.
    attributeValueIds: ids && ids.length > 0 ? ids : undefined,
  };
}

/**
 * An edit always sends the name, blank included: the API has no way to
 * null it, so a cleared name is stored empty and the portal falls back to
 * the SKU wherever it would have shown it.
 */
export function variantUpdateInput(
  formData: FormData,
): BackendUpdateVariantInput {
  return {
    skuCode: String(formData.get('skuCode') ?? '').trim(),
    name: String(formData.get('name') ?? '').trim(),
    attributeValueIds: attributeValueIds(formData),
  };
}
