import { AddressForm } from '@/components/address-form';
import { AddressListItem } from '@/components/address-list-item';
import { Card, CardContent } from '@/components/ui/card';
import type { Address } from '@/lib/commerce-types';
import type { FormState } from '@/lib/form';

/**
 * Every saved address, each editable in place, plus a form to add another.
 *
 * Not a client component itself — only `AddressListItem`'s per-address
 * edit/remove/default controls need interactivity, so the list and the add
 * form are rendered here on the server, same as `OrdersList`/`WishlistList`.
 */
export function AddressesSection({
  addresses,
  addAddress,
  updateAddress,
  removeAddress,
  setDefaultAddress,
}: {
  addresses: Address[];
  addAddress: (state: FormState, formData: FormData) => Promise<FormState>;
  updateAddress: (
    addressId: string,
    state: FormState,
    formData: FormData,
  ) => Promise<FormState>;
  removeAddress: (addressId: string) => Promise<FormState>;
  setDefaultAddress: (addressId: string) => Promise<FormState>;
}) {
  return (
    <div className="space-y-4">
      {addresses.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No saved addresses yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {addresses.map((address) => (
            <li key={address.id}>
              <AddressListItem
                address={address}
                update={updateAddress.bind(null, address.id)}
                remove={removeAddress.bind(null, address.id)}
                setDefault={setDefaultAddress.bind(null, address.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardContent className="space-y-3">
          <h3 className="text-sm font-medium">Add a new address</h3>
          <AddressForm action={addAddress} />
        </CardContent>
      </Card>
    </div>
  );
}
