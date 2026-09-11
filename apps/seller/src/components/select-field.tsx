import type { SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type SelectOption = {
  value: string;
  label: string;
};

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  options: SelectOption[];
  /** Label for the empty choice. Omit to require a selection. */
  placeholder?: string;
};

/**
 * A native select.
 *
 * Filters and forms in the portals post through plain HTML, so the control has
 * to carry its value in a form submission without any client-side JavaScript.
 */
export function SelectField({
  options,
  placeholder,
  className,
  ...props
}: SelectFieldProps) {
  return (
    <select
      {...props}
      className={cn(
        'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-lg border px-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-3',
        className,
      )}
    >
      {placeholder === undefined ? null : (
        <option value="">{placeholder}</option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
