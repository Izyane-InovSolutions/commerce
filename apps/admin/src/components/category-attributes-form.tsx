'use client';

import { useActionState, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';

import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

export type CategoryAttributeRow = {
  attributeId: string;
  name: string;
  isRequired: boolean;
  /** Set when an ancestor also attaches it, so this row overrides that. */
  overrides?: string;
};

/**
 * Edits the attributes attached to one category itself.
 *
 * The rows are held client-side so they can be added, reordered and removed
 * before saving; the form still posts plain fields (see
 * `category-attributes-input.ts`), one hidden `attributeId` per row in order.
 * Attaching an attribute a parent already has is how a branch makes it
 * required (or optional) differently from the parent.
 */
export function CategoryAttributesForm({
  action,
  initial,
  attributes,
  inherited,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial: CategoryAttributeRow[];
  /** Every catalog attribute, for the "add" choice. */
  attributes: { id: string; name: string }[];
  /** Attribute id → the ancestor it's inherited from. */
  inherited: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [rows, setRows] = useState(initial);
  const [adding, setAdding] = useState('');

  const attached = new Set(rows.map((row) => row.attributeId));
  const addable = attributes.filter((attribute) => !attached.has(attribute.id));

  function move(index: number, by: -1 | 1): void {
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row!);
      return next;
    });
  }

  function add(): void {
    const attribute = attributes.find((entry) => entry.id === adding);
    if (!attribute) return;
    setRows((current) => [
      ...current,
      {
        attributeId: attribute.id,
        name: attribute.name,
        isRequired: true,
        overrides: inherited[attribute.id],
      },
    ]);
    setAdding('');
  }

  return (
    <form action={formAction} className="space-y-4">
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing attached here yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((row, index) => (
            <li
              key={row.attributeId}
              className="flex flex-wrap items-center gap-3 px-3 py-2"
            >
              <input type="hidden" name="attributeId" value={row.attributeId} />
              <div className="min-w-32 flex-1">
                <p className="text-sm font-medium">{row.name}</p>
                {row.overrides ? (
                  <p className="text-muted-foreground text-xs">
                    Overrides the setting from {row.overrides}
                  </p>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="required"
                  value={row.attributeId}
                  checked={row.isRequired}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((entry) =>
                        entry.attributeId === row.attributeId
                          ? { ...entry, isRequired: event.target.checked }
                          : entry,
                      ),
                    )
                  }
                />
                Required
              </label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${row.name} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${row.name} down`}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${row.name}`}
                  onClick={() =>
                    setRows((current) =>
                      current.filter(
                        (entry) => entry.attributeId !== row.attributeId,
                      ),
                    )
                  }
                >
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {addable.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-attribute">Attach an attribute</Label>
            <SelectField
              id="add-attribute"
              value={adding}
              onChange={(event) => setAdding(event.target.value)}
              placeholder="Choose…"
              options={addable.map((attribute) => ({
                value: attribute.id,
                label: inherited[attribute.id]
                  ? `${attribute.name} (inherited from ${inherited[attribute.id]})`
                  : attribute.name,
              }))}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={adding === ''}
            onClick={add}
          >
            Add
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Saving…">Save attributes</SubmitButton>
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-xs" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
      <FormError state={state} />
    </form>
  );
}
