import type { Address } from '@prisma/client';

// The recipient/geographic fields only — no id/userId/timestamps/isDefault.
// Checkout stores this plain object as JSON on the order at purchase time, so
// the delivery address survives the customer later editing their address
// book.
export type AddressSnapshot = {
  label: string | null;
  recipientName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
};

export function toAddressSnapshot(address: Address): AddressSnapshot {
  return {
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    region: address.region,
    postalCode: address.postalCode,
    country: address.country,
  };
}
