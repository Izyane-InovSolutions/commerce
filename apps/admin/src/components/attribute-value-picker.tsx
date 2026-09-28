import { SelectField } from '@/components/select-field';
import { Label } from '@/components/ui/label';

export type AttributeChoice = {
  id: string;
  name: string;
  values: { id: string; value: string }[];
};

/**
 * One select per catalog attribute, for picking a variant's values.
 *
 * Every select posts as `attributeValueIds`, alongside an `attributesShown`
 * marker that tells the action the pickers were on screen — see
 * `variant-input.ts` for why an edit needs to know. An attribute with no
 * values yet has nothing to offer and is left out.
 */
export function AttributeValuePicker({
  attributes,
  selected = [],
  idPrefix,
}: {
  attributes: AttributeChoice[];
  /** Value ids the variant already carries. */
  selected?: string[];
  /** Keeps label ids unique when several pickers share a page. */
  idPrefix: string;
}) {
  const offered = attributes.filter((attribute) => attribute.values.length > 0);
  if (offered.length === 0) {
    return null;
  }

  return (
    <>
      <input type="hidden" name="attributesShown" value="1" />
      {offered.map((attribute) => {
        const id = `${idPrefix}-attr-${attribute.id}`;
        const current = attribute.values.find((value) =>
          selected.includes(value.id),
        );

        return (
          <div key={attribute.id} className="min-w-32 space-y-1.5">
            <Label htmlFor={id}>{attribute.name}</Label>
            <SelectField
              id={id}
              name="attributeValueIds"
              className="w-full"
              placeholder="—"
              defaultValue={current?.id ?? ''}
              options={attribute.values.map((value) => ({
                value: value.id,
                label: value.value,
              }))}
            />
          </div>
        );
      })}
    </>
  );
}
