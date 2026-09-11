import type { FormState } from '@/lib/form';

export function FormError({ state }: { state: FormState }) {
  if (state.status !== 'error' || !state.message) {
    return null;
  }

  return (
    <p
      role="alert"
      className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
    >
      {state.message}
    </p>
  );
}
