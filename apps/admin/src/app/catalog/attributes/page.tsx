import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { backendListAttributes } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { AttributeAddForm } from '@/components/attribute-add-form';
import { AttributeRowForm } from '@/components/attribute-row-form';
import { AttributeValueAddForm } from '@/components/attribute-value-add-form';
import { AttributeValueRow } from '@/components/attribute-value-row';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

import {
  addAttributeValueAction,
  createAttributeAction,
  deleteAttributeAction,
  deleteAttributeValueAction,
  updateAttributeAction,
  updateAttributeValueAction,
} from './actions';

export const metadata: Metadata = { title: 'Attributes' };

export default async function AttributesPage() {
  await requireAdmin();

  let attributes;
  try {
    attributes = await backendListAttributes(apiClient);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Attributes"
          description="What variants are told apart by."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/catalog">
            <ArrowLeft data-icon="inline-start" />
            Catalog
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Attributes"
        description="Attributes like colour and size are shared by every product, and a variant picks its values from here — which is what lets the storefront filter by them. Deleting is not refused while variants use a value: it takes the value off them."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add an attribute</CardTitle>
          <CardDescription>
            The code is what storefront filters key on, so keep it stable once
            products use it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AttributeAddForm action={createAttributeAction} />
        </CardContent>
      </Card>

      {attributes.length === 0 ? (
        <EmptyState
          title="No attributes yet"
          description="Add one above, then give it values for variants to pick from."
        />
      ) : (
        attributes.map((attribute) => (
          <Card key={attribute.id}>
            <CardHeader>
              <CardTitle>{attribute.name}</CardTitle>
              <CardDescription>
                {attribute.values.length === 0
                  ? 'No values yet — variant forms leave an attribute out until it has one.'
                  : `${attribute.values.length} ${attribute.values.length === 1 ? 'value' : 'values'}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <AttributeRowForm
                attribute={attribute}
                valueCount={attribute.values.length}
                save={updateAttributeAction.bind(null, attribute.id)}
                remove={deleteAttributeAction.bind(null, attribute.id)}
              />

              <div className="space-y-3 border-t pt-4">
                {attribute.values.length > 0 ? (
                  <div className="divide-y">
                    {attribute.values.map((value) => (
                      <div key={value.id} className="py-2">
                        <AttributeValueRow
                          value={value}
                          save={updateAttributeValueAction.bind(
                            null,
                            attribute.id,
                            value.id,
                          )}
                          remove={deleteAttributeValueAction.bind(
                            null,
                            attribute.id,
                            value.id,
                          )}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
                <AttributeValueAddForm
                  attributeId={attribute.id}
                  attributeName={attribute.name}
                  action={addAttributeValueAction.bind(null, attribute.id)}
                />
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
