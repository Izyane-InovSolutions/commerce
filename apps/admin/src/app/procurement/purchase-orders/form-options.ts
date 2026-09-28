import {
  backendListProducts,
  backendListSuppliers,
  backendListWarehouses,
} from '@commerce/api-client';
import type { BackendSupplier } from '@commerce/contracts';

import type { SupplierOption } from '@/components/purchase-order-form';
import type { SelectOption } from '@/components/select-field';
import { apiClient } from '@/lib/api';
import { variantDirectory, variantOptions } from '@/lib/procurement';

/** The API's largest page — one read covers any realistic supplier list. */
const SUPPLIER_LIMIT = 100;

function supplierOption(supplier: BackendSupplier): SupplierOption {
  const name = supplier.tradingName || supplier.legalName;
  return {
    value: supplier.id,
    label:
      supplier.status === 'ACTIVE'
        ? `${name} (${supplier.code})`
        : `${name} (${supplier.code}) — inactive`,
    currency: supplier.defaultCurrency,
    leadTimeDays: supplier.leadTimeDays,
  };
}

/**
 * Everything the purchase-order form offers to choose from. Only active
 * suppliers and warehouses are listed, since the API refuses any other on a
 * new order — except those an existing draft already names, which stay
 * listed so an edit doesn't silently swap them out.
 */
export async function loadPurchaseOrderFormOptions(keep?: {
  supplier?: BackendSupplier;
  warehouseId?: string;
  variantIds?: string[];
}): Promise<{
  suppliers: SupplierOption[];
  warehouses: SelectOption[];
  variants: SelectOption[];
}> {
  const [supplierPage, warehouses, products] = await Promise.all([
    backendListSuppliers(apiClient, {
      status: 'ACTIVE',
      limit: SUPPLIER_LIMIT,
    }),
    backendListWarehouses(apiClient),
    backendListProducts(apiClient),
  ]);

  const suppliers = supplierPage.items.map(supplierOption);
  if (keep?.supplier && !suppliers.some((s) => s.value === keep.supplier!.id)) {
    suppliers.unshift(supplierOption(keep.supplier));
  }

  return {
    suppliers,
    warehouses: warehouses
      .filter(
        (warehouse) => warehouse.isActive || warehouse.id === keep?.warehouseId,
      )
      .map((warehouse) => ({
        value: warehouse.id,
        label: warehouse.isActive
          ? `${warehouse.name} (${warehouse.code})`
          : `${warehouse.name} (${warehouse.code}) — inactive`,
      })),
    variants: variantOptions(variantDirectory(products), keep?.variantIds),
  };
}
