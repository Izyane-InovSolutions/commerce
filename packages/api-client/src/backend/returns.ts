import type {
  BackendApproveReturnInput,
  BackendCreateReturnInput,
  BackendItemsPage,
  BackendPostReturnInspectionInput,
  BackendPostReturnReceiptInput,
  BackendRefundCase,
  BackendRejectReturnInput,
  BackendReturnEligibility,
  BackendReturnRequest,
} from '@commerce/contracts';
import type { ApiClient, QueryValue } from '../client.ts';

export const backendGetReturnEligibility = (
  client: ApiClient,
  orderId: string,
) =>
  client.get<BackendReturnEligibility[]>(
    `/orders/${orderId}/return-eligibility`,
    { cache: 'no-store' },
  );
export const backendCreateReturn = (
  client: ApiClient,
  orderId: string,
  input: BackendCreateReturnInput,
  key: string,
) =>
  client.post<BackendReturnRequest>(`/orders/${orderId}/returns`, {
    body: input,
    idempotencyKey: key,
  });
export const backendListOwnReturns = (client: ApiClient) =>
  client.get<BackendReturnRequest[]>('/returns', { cache: 'no-store' });
export const backendGetOwnReturn = (client: ApiClient, id: string) =>
  client.get<BackendReturnRequest>(`/returns/${id}`, { cache: 'no-store' });
export const backendCancelReturn = (
  client: ApiClient,
  id: string,
  version: number,
) =>
  client.post<BackendReturnRequest>(`/returns/${id}/cancel`, {
    body: { version },
  });
export const backendListReturns = (
  client: ApiClient,
  query: Record<string, QueryValue> = {},
) =>
  client.get<BackendItemsPage<BackendReturnRequest>>('/admin/returns', {
    query,
    cache: 'no-store',
  });
export const backendGetReturn = (client: ApiClient, id: string) =>
  client.get<BackendReturnRequest>(`/admin/returns/${id}`, {
    cache: 'no-store',
  });
export const backendApproveReturn = (
  client: ApiClient,
  id: string,
  input: BackendApproveReturnInput,
) =>
  client.post<BackendReturnRequest>(`/admin/returns/${id}/approve`, {
    body: input,
  });
export const backendRejectReturn = (
  client: ApiClient,
  id: string,
  input: BackendRejectReturnInput,
) =>
  client.post<BackendReturnRequest>(`/admin/returns/${id}/reject`, {
    body: input,
  });
export const backendPostReturnReceipt = (
  client: ApiClient,
  id: string,
  input: BackendPostReturnReceiptInput,
  key: string,
) =>
  client.post<BackendReturnRequest>(`/admin/returns/${id}/receipts`, {
    body: input,
    idempotencyKey: key,
  });
export const backendPostReturnInspection = (
  client: ApiClient,
  id: string,
  input: BackendPostReturnInspectionInput,
  key: string,
) =>
  client.post<BackendReturnRequest>(`/admin/returns/${id}/inspections`, {
    body: input,
    idempotencyKey: key,
  });
export const backendFinalizeReturnInspection = (
  client: ApiClient,
  id: string,
  shippingRefunds: { sellerOrderId: string; amount: number }[] = [],
) =>
  client.post<BackendReturnRequest>(
    `/admin/returns/${id}/finalize-inspection`,
    { body: { shippingRefunds } },
  );
export const backendRetryReturnRefund = (
  client: ApiClient,
  id: string,
  refundCaseId: string,
) =>
  client.post<BackendRefundCase>(
    `/admin/returns/${id}/refund-cases/${refundCaseId}/retry`,
    { body: {} },
  );
