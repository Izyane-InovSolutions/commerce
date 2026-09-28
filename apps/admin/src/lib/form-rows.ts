/**
 * Helpers for forms that post a variable number of rows — purchase-order
 * lines, receipt lines — through plain HTML.
 *
 * Each row's inputs are named `prefix.index.field` (`lines.0.variantId`), so
 * the browser posts them flat and this puts them back together. Indexes need
 * not be contiguous: a row removed on the client simply leaves a gap, and
 * each row keeps its own index so a field error can find its way back to
 * the input that caused it.
 */

export type FormRow = {
  /** The index the row was posted under — stable across a failed submit. */
  index: number;
  fields: Record<string, string>;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function readIndexedRows(formData: FormData, prefix: string): FormRow[] {
  const rows = new Map<number, Record<string, string>>();
  const pattern = new RegExp(`^${escapeRegExp(prefix)}\\.(\\d+)\\.(\\w+)$`);

  for (const [key, value] of formData.entries()) {
    const match = pattern.exec(key);
    if (!match || typeof value !== 'string') continue;
    const index = Number(match[1]);
    const fields = rows.get(index) ?? {};
    fields[match[2]!] = value.trim();
    rows.set(index, fields);
  }

  return [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, fields]) => ({ index, fields }));
}

/** The field-error key for one input of one row, e.g. `lines.3.quantity`. */
export function rowField(prefix: string, index: number, field: string): string {
  return `${prefix}.${index}.${field}`;
}

/** A trimmed string field, or `undefined` when blank — the API's "not sent". */
export function optionalText(
  value: FormDataEntryValue | string | null | undefined,
): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? undefined : text;
}

/**
 * A whole number at or above `min`, or `NaN`. Blank is `NaN` too — callers
 * that allow blank use {@link optionalWholeNumber}.
 */
export function wholeNumber(value: string | undefined, min = 0): number {
  const text = value?.trim() ?? '';
  if (!/^\d+$/.test(text)) return Number.NaN;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= min ? parsed : Number.NaN;
}

/** `wholeNumber`, but blank means "not sent" rather than invalid. */
export function optionalWholeNumber(
  value: string | undefined,
  min = 0,
): number | undefined {
  return value === undefined || value.trim() === ''
    ? undefined
    : wholeNumber(value, min);
}

/** Appends a message to a field's error list, creating it if needed. */
export function addFieldError(
  errors: Record<string, string[]>,
  field: string,
  message: string,
): void {
  (errors[field] ??= []).push(message);
}
