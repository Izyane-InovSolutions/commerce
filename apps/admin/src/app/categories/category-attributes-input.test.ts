import { describe, expect, it } from 'vitest';

import { categoryAttributesInput } from './category-attributes-input';

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe('categoryAttributesInput', () => {
  it('keeps row order and reads each required box', () => {
    expect(
      categoryAttributesInput(
        form([
          ['attributeId', 'storage'],
          ['attributeId', 'color'],
          ['required', 'color'],
        ]),
      ),
    ).toEqual({
      attributes: [
        { attributeId: 'storage', isRequired: false },
        { attributeId: 'color', isRequired: true },
      ],
    });
  });

  it('drops blanks and repeated rows', () => {
    expect(
      categoryAttributesInput(
        form([
          ['attributeId', ''],
          ['attributeId', 'color'],
          ['attributeId', 'color'],
        ]),
      ).attributes,
    ).toEqual([{ attributeId: 'color', isRequired: false }]);
  });

  it('sends an empty list when every row is removed', () => {
    expect(categoryAttributesInput(form([]))).toEqual({ attributes: [] });
  });
});
