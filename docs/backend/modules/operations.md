# Operations

> A read-only admin dashboard endpoint. For a date range and optional warehouse and status filters, it aggregates sales, orders by status, the fulfillment backlog, the inventory snapshot and return metrics.

## Purpose and features

- **Admins** fetch one metrics document from `GET /admin/operations/metrics`. It has six sections: `range`, `sales`, `ordersByStatus`, `fulfillment`, `inventory`, `returns` ([operations-metrics.types.ts:73](../../../services/commerce-api/src/modules/operations/operations-metrics.types.ts#L73)).
- Every figure is computed live with Prisma aggregates. Nothing is cached or stored.

## Routes

Conventions: see [../architecture.md](../architecture.md) and [../auth-and-access.md](../auth-and-access.md).

| Method | Path                             | Access       | Idempotency | Description                                                                                                                                                                                                                                     |
| ------ | -------------------------------- | ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/v1/admin/operations/metrics | Roles(ADMIN) | n/a         | Operations metrics for `from`/`to`, `warehouseId`, `orderStatuses`, `fulfillmentStatuses`, `returnStatuses` ([operations-metrics.controller.ts:16](../../../services/commerce-api/src/modules/operations/operations-metrics.controller.ts#L16)) |

**Query DTO** ([operations-metrics-query.dto.ts:27](../../../services/commerce-api/src/modules/operations/dto/operations-metrics-query.dto.ts#L27)):

- `from` and `to` are ISO-8601. `warehouseId` is a UUID.
- The status arrays accept either `A,B` or repeated keys, and each entry is validated against its Prisma enum.

## Services

| Service                                                                                                                                           | Responsibility                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OperationsMetricsService` ([operations-metrics.service.ts](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts)) | `getMetrics(query)`. `getSales` runs first (its `paidOrderCount` feeds the return rate); the other four sections then run with `Promise.all` ([:67](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L67)). Not exported. |

## Business rules

### Range

- `to` defaults to now. `from` defaults to `to - 30 days` ([operations-metrics.service.ts:97](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L97)).
- `to <= from` returns 400. A span over 366 days returns 400.
- The range is applied inclusively (`gte`/`lte`) to `createdAt` columns.

### Sales

([operations-metrics.service.ts:114](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L114))

- **Paid orders.** `paidOrderCount` and `grossSales` count orders created in range whose **current** status is `PAID | PARTIALLY_REFUNDED | REFUNDED`. `grossSales` is the sum of `Order.total`. Orders are never filtered by warehouse.
- **Refunds.** `itemRefunds` and `shippingRefunds` come from `SUCCEEDED` refund cases created in range: `amount - shippingAmount`, and `shippingAmount`. With a `warehouseId` filter, only RETURN cases whose return request has that warehouse are counted ([:144](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L144)).
- **Net.** `netSales = grossSales - itemRefunds - shippingRefunds`.

### Orders by status

- `groupBy status` over orders created in range, optionally narrowed by `orderStatuses` ([operations-metrics.service.ts:167](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L167)).

### Fulfillment

([operations-metrics.service.ts:183](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L183))

- **Backlog.** `backlogCount` counts every fulfillment order not `DISPATCHED`/`CANCELLED`, ignoring the date range. It is filtered by warehouse only.
- **Aging.** `aging.averageAgeHours` and `maxAgeHours` measure backlog rows from `createdAt` to now.
- **Status totals.** `statusTotals` groups fulfillment orders created in range by status, filtered by warehouse and `fulfillmentStatuses`.

### Inventory

- A current snapshot, never date-filtered, across all `InventoryRecord`s or one warehouse ([operations-metrics.service.ts:232](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L232)).
- **Buckets.** A record is out of stock when `available = onHand - reserved <= 0`. Otherwise it is low stock when `available <= reorderPoint`. The two buckets are mutually exclusive.

### Returns

([operations-metrics.service.ts:265](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L265))

- **Base filter.** Return requests created in range, optionally narrowed by `warehouseId` and `returnStatuses`.
- **Grouped counts.** `countsByStatus` groups those requests by status. `countsByReasonCode` groups their `ReturnItem`s by `reasonCode`.
- **Returned quantity.** `returnedQuantity` is the sum of `acceptedQuantity` over inspection lines that have a `disposition`.
- **Refund value.** `refundValue` is the sum of `amount` over RETURN-source, SUCCEEDED refund cases created in range. The return-request filter is applied only when a warehouse or status filter is given.
- **Return rate.** `returnRate = returnRequestCount / paidOrderCount`, or null when there are no paid orders ([:346](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L346)).
- **Processing age.**
  - `openAverageAgeHours` covers every non-terminal request (all time, filtered by warehouse), from `createdAt` to now.
  - `closedAverageAgeHours` covers terminal requests in range, from `createdAt` to `updatedAt`, where `updatedAt` stands in for a closed-at time.
  - The terminal statuses are `REJECTED, CANCELLED, CLOSED_NO_REFUND, REFUNDED, REFUND_FAILED, PARTIALLY_REFUNDED` ([:43](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L43)).

## Data

| Model                                                 | Access                                 |
| ----------------------------------------------------- | -------------------------------------- |
| `Order`                                               | aggregate, groupBy                     |
| `RefundCase`                                          | findMany, aggregate                    |
| `FulfillmentOrder`                                    | count, groupBy, findMany (`createdAt`) |
| `InventoryRecord`                                     | findMany (all rows)                    |
| `ReturnRequest`, `ReturnItem`, `ReturnInspectionLine` | groupBy, aggregate, count, findMany    |

Read-only. No transaction wraps the queries, so the sections are not a consistent snapshot of each other.

## Dependencies

- `PrismaService` only. There are no module imports and no exports ([operations.module.ts:6](../../../services/commerce-api/src/modules/operations/operations.module.ts#L6)).

## Jobs and events

None.

## Configuration

None. The default range (30 days) and maximum range (366 days) are constants ([operations-metrics.service.ts:22](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L22)).

## Tests

- [operations-metrics.service.spec.ts](../../../services/commerce-api/src/modules/operations/operations-metrics.service.spec.ts):
  - Range defaults and range validation.
  - Warehouse and status narrowing; inventory never date-filtered.
  - Net-sales arithmetic; non-attributable refunds excluded under a warehouse filter.
  - Aging, inventory buckets, return rate (including null), SUCCEEDED-only refund value.
- No controller or DTO (array transform) tests.

## Known gaps

- **Refunds from every source are counted.** Without a warehouse filter, `itemRefunds` and `shippingRefunds` include SUCCEEDED refund cases from **every** source (`FULFILLMENT_CANCELLATION`, `ADMIN`). The type comment says "RETURN-sourced cases" ([operations-metrics.service.ts:128](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L128), [operations-metrics.types.ts:17](../../../services/commerce-api/src/modules/operations/operations-metrics.types.ts#L17)).
- **Currencies are mixed.** All money figures are summed with no regard to currency (`Order.total`, `RefundCase.amount`).
- **Sales are dated by creation.** They are keyed on `Order.createdAt` and the order's current status, so a refunded order still counts in `grossSales`. Refunds are keyed on `RefundCase.createdAt`, not the time they succeeded. `PARTIALLY_SUCCEEDED` cases are ignored.
- **Warehouse filter is applied unevenly.** Refunds are warehouse-filtered but `grossSales` is not, so `netSales` mixes scopes. The same goes for `returnRate`: the numerator is filtered, `paidOrderCount` is not.
- **Some "terminal" return statuses are not final.** `REFUND_FAILED` and `PARTIALLY_REFUNDED` count as terminal for aging, but `RefundCasesService` can still move those returns on retry ([operations-metrics.service.ts:43](../../../services/commerce-api/src/modules/operations/operations-metrics.service.ts#L43)).
- **Unbounded reads.** Every `InventoryRecord`, backlog fulfillment order and open return request is loaded into memory on each call.
- **Seller stock is included.** Without a warehouse filter, inventory totals include seller offer-scoped records (no warehouse).
- **No DB re-check of the admin role.** Only the JWT `Roles(ADMIN)` check applies.
