import type { BackendSetCategoryAttributesInput } from '@commerce/contracts';

/**
 * Reads the category attributes form: one hidden `attributeId` per row, in
 * display order, and a `required` checkbox per row posting that row's
 * attribute id when ticked.
 */
export function categoryAttributesInput(
  formData: FormData,
): BackendSetCategoryAttributesInput {
  const required = new Set(formData.getAll('required').map(String));
  const seen = new Set<string>();
  const attributes: BackendSetCategoryAttributesInput['attributes'] = [];

  for (const raw of formData.getAll('attributeId')) {
    const attributeId = String(raw).trim();
    if (attributeId === '' || seen.has(attributeId)) continue;
    seen.add(attributeId);
    attributes.push({ attributeId, isRequired: required.has(attributeId) });
  }
  return { attributes };
}
