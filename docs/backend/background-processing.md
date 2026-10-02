# Background processing

> Asynchronous work in the API: the Postgres-backed job queue, the transactional outbox, and the scheduled tasks. All of it runs inside the API process.

## Overview

| Mechanism       | Storage               | Who drives it                                      | Used for                                                                                                                      |
| --------------- | --------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Job queue       | `BackgroundJob` table | `JobWorkerService` polls every 5 s                 | Work that must eventually happen after a commit (fulfillment provisioning, refunds, emails, reservation expiry, cart cleanup) |
| Outbox          | `OutboxEvent` table   | `OutboxDispatcherService`; see [Outbox](#outbox) | Domain event log written in the same transaction as the change                                                                |
| Scheduled tasks | –                     | `@nestjs/schedule` `@Interval`                     | Periodic sweeps: payouts, FX, tracking, expiry cleanups                                                                       |

`ScheduleModule` is set up in [jobs.module.ts](../../services/commerce-api/src/infrastructure/jobs/jobs.module.ts). Setting `SCHEDULED_WORKERS_ENABLED=false` turns off **all** intervals, crons and timeouts. That includes the job worker poll itself, so jobs pile up unprocessed. Integration tests use this setting so the tests control timing.

## Job queue

**Enqueueing.** `BackgroundJobsService.enqueue({ type, payload, runAt?, maxAttempts? }, tx?)` inserts a `PENDING` row ([background-jobs.service.ts:18-30](../../services/commerce-api/src/infrastructure/jobs/background-jobs.service.ts#L18-L30)). Pass the caller's `tx` so the job only exists if the business change commits.

**Claiming.** `claimNext()` works like this ([background-jobs.service.ts:32-79](../../services/commerce-api/src/infrastructure/jobs/background-jobs.service.ts#L32-L79)):

- It selects the oldest job that is either `PENDING` with `runAt <= now`, or `RUNNING` with `lockedAt` more than **5 minutes** old. The second case lets a job abandoned by a crashed process be reclaimed.
- It claims the job with a conditional `updateMany` on `(id, status, updatedAt)`. That sets `RUNNING`, increments `attempts` and stores a new `lockToken`. Two workers can never both claim the same job.

**Processing.** `JobWorkerService.poll()` runs every 5 s, with an in-memory re-entry flag. It keeps claiming and running jobs until the queue is empty ([job-worker.service.ts:22-40](../../services/commerce-api/src/infrastructure/jobs/job-worker.service.ts#L22-L40)).

- **On success:** `complete()` sets the job to `SUCCEEDED`, but only if the `lockToken` still matches.
- **On failure:** `fail()` moves the job back to `PENDING` with exponential backoff (`min(60 s, 1 s × 2^attempts)`). Once `attempts >= maxAttempts` (default **5**) it becomes `DEAD_LETTER`, and the handler's optional `onDeadLetter(payload)` is called ([background-jobs.service.ts:98-122](../../services/commerce-api/src/infrastructure/jobs/background-jobs.service.ts#L98-L122)).
- **Unknown types:** a job whose type has no registered handler fails like any other error and eventually dead-letters.

**Handlers.** A handler implements [`JobHandler`](../../services/commerce-api/src/infrastructure/jobs/job-handler.interface.ts) (`type`, `handle(payload)`, optional `onDeadLetter`). Handlers are registered in [workers.module.ts](../../services/commerce-api/src/infrastructure/workers/workers.module.ts):

| Job type                                   | Handler                                                                                                                                        | Enqueued by                                                                                                                                                                                                                                                        | Does                                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `inventory.expire_reservation`             | [inventory-expire-reservation.handler.ts](../../services/commerce-api/src/modules/inventory/jobs/inventory-expire-reservation.handler.ts)      | `InventoryService` when a reservation is created, with `runAt` set to its expiry ([inventory.service.ts:548](../../services/commerce-api/src/modules/inventory/inventory.service.ts#L548))                                                                         | Expires the reservation if it is still `ACTIVE` and returns the stock                                       |
| `cart.cleanup_items`                       | [cart-cleanup.handler.ts](../../services/commerce-api/src/modules/cart/jobs/cart-cleanup.handler.ts)                                           | `CheckoutService` when removing checked-out lines failed after the order was created ([checkout.service.ts:106](../../services/commerce-api/src/modules/checkout/checkout.service.ts#L106))                                                                        | Retries removing the lines from the cart                                                                    |
| `fulfillment.provision`                    | [fulfillment-provision.handler.ts](../../services/commerce-api/src/modules/fulfillment/jobs/fulfillment-provision.handler.ts)                  | `OrdersService.confirmPayment` when the order becomes PAID ([orders.service.ts:617](../../services/commerce-api/src/modules/orders/orders.service.ts#L617))                                                                                                        | Creates fulfillment orders for each shipping group; safe to run twice                                       |
| `refunds.process_fulfillment_cancellation` | [fulfillment-cancellation-refund.handler.ts](../../services/commerce-api/src/modules/payments/jobs/fulfillment-cancellation-refund.handler.ts) | `FulfillmentsService` when paid lines are cancelled ([fulfillments.service.ts:1239](../../services/commerce-api/src/modules/fulfillment/fulfillments.service.ts#L1239), [1321](../../services/commerce-api/src/modules/fulfillment/fulfillments.service.ts#L1321)) | Opens and processes refund cases for the cancelled quantity                                                 |
| `email.send`                               | [email-send.handler.ts](../../services/commerce-api/src/infrastructure/email/email-send.handler.ts)                                            | `EmailDeliveriesService.enqueue`, called from auth for password reset, password changed and email verification                                                                                                                                                     | Sends the email over SMTP. On dead letter the delivery is marked `FAILED` with `DELIVERY_RETRIES_EXHAUSTED` |

### Email delivery pipeline

```mermaid
sequenceDiagram
  participant A as AuthService (tx)
  participant D as EmailDeliveriesService
  participant Q as BackgroundJob
  participant W as JobWorker
  participant S as SMTP
  A->>D: enqueue(tx, template, recipient, variables)
  D->>D: EmailDelivery row, variables AES-GCM encrypted (ctx email-delivery:id), expiresAt ≤ 24h
  D->>Q: email.send {deliveryId} (same tx)
  W->>D: send(deliveryId)
  D->>D: skip unless PENDING; fail EXPIRED / token no longer active
  D->>S: renderEmail + sendMail (Message-ID <id@commerce.email>)
  D->>D: SENT, encryptedVars wiped
```

- Templates are `password-reset`, `password-changed` and `email-verification` ([email-templates.ts](../../services/commerce-api/src/infrastructure/email/email-templates.ts)).
- **Token check before sending.** Just before sending, the linked reset or verification token is checked again: it must be unused, unexpired and, for verification, still for the account's current email address. An email is never sent for a token that is no longer active ([email-deliveries.service.ts:86-120](../../services/commerce-api/src/infrastructure/email/email-deliveries.service.ts#L86-L120)).
- **Errors.** Template errors fail the delivery permanently. SMTP errors are rethrown as `SMTP_DELIVERY_FAILED` so the job retries.
- **Clearing variables.** The encrypted variables are deleted once the delivery reaches any final state: `SENT`, `FAILED` or expired.

## Outbox

`OutboxService.record(..., tx)` writes an event in the caller's transaction. [OutboxDispatcherService](../../services/commerce-api/src/infrastructure/jobs/outbox-dispatcher.service.ts) claims and delivers events to registered subscribers with leases, retries and dead-letter handling. [NotificationsOutboxSubscriber](../../services/commerce-api/src/modules/notifications/notifications-outbox.subscriber.ts) is registered by `WorkersModule` and creates notification work. The dispatcher and subscriber have unit specs; real crash/replay and multi-replica behavior remain verification gates. See the [current baseline](baseline-verification.md).

Topics written today:

| Topic                                                                              | Written by                           |
| ---------------------------------------------------------------------------------- | ------------------------------------ |
| `order.paid`                                                                       | orders: payment confirmed            |
| `fulfillment.provisioned`                                                          | fulfillment provisioning             |
| `fulfillment.dispatched`                                                           | fulfillment: admin dispatch          |
| `fulfillment.refund_required`                                                      | fulfillment: paid quantity cancelled |
| `shipment.booked`                                                                  | shipments: carrier booking           |
| `procurement.po.submitted`, `.po.approved`, `.po.ordered`, `.po.completed`         | purchase orders                      |
| `procurement.receipt.posted`, `.receipt.discrepancy_detected`, `.receipt.reversed` | goods receipts                       |
| `product_review.submitted`, `.edited`, `.withdrawn`                                | reviews                              |
| `seller_rating.submitted`, `.edited`, `.withdrawn`                                 | reviews                              |

## Scheduled tasks

The source also includes the outbox dispatcher (default 5 seconds), notification delivery, and `PaymentReconciliationScheduler` (30 seconds, unified payments only). Reconciliation takes a database advisory lock and queues `payments.reconcile` jobs; its handler refreshes gateway state and expires eligible referenced attempts. The current manual/provider configuration and source wiring are not live-delivery verification.

| Task                     | Interval                                     | Source                                                                                                                         | Does                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job worker poll          | 5 s                                          | [job-worker.service.ts:22](../../services/commerce-api/src/infrastructure/jobs/job-worker.service.ts#L22)                      | Drains the job queue                                                                                                                                                                                                                            |
| Payout processing        | 60 s                                         | [payout-processing.service.ts:17](../../services/commerce-api/src/modules/financials/payouts/payout-processing.service.ts#L17) | In order: release matured held funds → move `PROCESSING` requests stuck over 15 min to `RECONCILIATION_REQUIRED` → resume open batches → create and process new batches until none are left. See [modules/financials.md](modules/financials.md) |
| FX refresh               | 1 h, and once at boot unless `NODE_ENV=test` | [fx-rates-refresh.scheduler.ts](../../services/commerce-api/src/modules/payments/fx-rates-refresh.scheduler.ts)                | Fetches rates from exchangerate-api.com into `FxRate`. Does nothing without `PAYMENT_FX_API_KEY`                                                                                                                                                |
| Shipment tracking poll   | 60 s                                         | [shipment-tracking-poller.service.ts](../../services/commerce-api/src/modules/shipments/shipment-tracking-poller.service.ts)   | Calls `CarrierProvider.poll` for every shipment not yet in a final status. Has no effect today, because the manual carrier returns no events                                                                                                    |
| Refresh-recovery cleanup | 60 s                                         | [auth.service.ts:859](../../services/commerce-api/src/modules/auth/auth.service.ts#L859)                                       | Clears expired `Session.recoveryData`                                                                                                                                                                                                           |
| Email expiry             | 60 s                                         | [email-deliveries.service.ts:166](../../services/commerce-api/src/infrastructure/email/email-deliveries.service.ts#L166)       | Marks expired `PENDING` deliveries as `FAILED` (`EXPIRED`)                                                                                                                                                                                      |

## Shutdown and observability

- **Shutdown.** On SIGTERM/SIGINT the job worker stops claiming new jobs and waits up to 10 s for the one in progress (`beforeApplicationShutdown`). A job still running after that keeps its lease and is reclaimed after 5 minutes (N7). The outbox dispatcher and other recurring tasks are cleared by the scheduler at application shutdown. A batch in progress then is recovered by its lease. Separating scheduler and worker controls is Stage 11 work.
- **Metrics.** Each process records job outcomes (`succeeded`, `failed`, `dead_letter`), handler duration and eligible-to-start lag (from `run_at`), plus outbox outcomes and first-attempt dispatch lag. Database gauges add depth by type/topic and status, retrying rows, oldest-due age, stale `RUNNING` claims and dead letters. See [architecture](architecture.md) and `GET /api/v1/metrics`.

## Running more than one instance

Every API replica runs every task above. What prevents double work:

- **Jobs and outbox events** use conditional claims and lease tokens. Crash/replay and multiple-replica execution still require explicit verification; source mechanisms alone are not a safety certificate.
- **Payouts** rely on row locks and conditional status transitions inside `PayoutsService`. The in-memory `running` flag only protects a single process.
- **Sweeps are idempotent** (FX refresh, recovery and email cleanup, tracking polls) but do redundant work on every replica.
- **Tip:** to limit schedulers to one node, set `SCHEDULED_WORKERS_ENABLED=false` on the other replicas. But then those replicas also stop draining jobs. Work that is only enqueued, not handled inline, still runs as long as at least one replica has workers on.
