# Users

> The signed-in user's own profile and address book, plus the `UsersService` identity helpers that auth and sellers build on.

## Purpose and features

- **Any signed-in user** (customer, seller, staff, admin) reads their profile (`id`, `email`, `role`, `firstName`, `lastName`, `phone`) and edits the name and phone fields.
- **Any signed-in user** keeps an address book: list, read, create, update, delete, and pick a default address. The first address is the default automatically.
- **Other modules** use `UsersService` for email normalisation, lookup by email/id, account creation, password-hash updates, the access check (`role` + `isActive`) and the CUSTOMER to SELLER promotion. Orders use `AddressesService` for addresses picked at checkout.

## Routes

Conventions (prefix, guards, envelope, errors): see [../architecture.md](../architecture.md) and [../auth-and-access.md](../auth-and-access.md). No route in this module has `@Public`, `@Roles` or `@RequireVerifiedEmail`, so each one only needs a valid session.

| Method | Path                                   | Access        | Idempotency                      | Description                                                                                                                                                                |
| ------ | -------------------------------------- | ------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/v1/users/me                       | Authenticated | n/a                              | Own profile; 404 if the row is gone ([users.controller.ts:19](../../../services/commerce-api/src/modules/users/users.controller.ts#L19))                                   |
| PATCH  | /api/v1/users/me                       | Authenticated | Naturally idempotent (overwrite) | Update `firstName`, `lastName`, `phone` ([users.controller.ts:30](../../../services/commerce-api/src/modules/users/users.controller.ts#L30))                               |
| GET    | /api/v1/users/me/addresses             | Authenticated | n/a                              | Own addresses, newest first ([addresses.controller.ts:25](../../../services/commerce-api/src/modules/users/addresses/addresses.controller.ts#L25))                         |
| GET    | /api/v1/users/me/addresses/:id         | Authenticated | n/a                              | One own address; another user's address returns 404 ([addresses.controller.ts:30](../../../services/commerce-api/src/modules/users/addresses/addresses.controller.ts#L30)) |
| POST   | /api/v1/users/me/addresses             | Authenticated | None (every call creates a row)  | Create an address ([addresses.controller.ts:38](../../../services/commerce-api/src/modules/users/addresses/addresses.controller.ts#L38))                                   |
| PATCH  | /api/v1/users/me/addresses/:id         | Authenticated | Naturally idempotent             | Partial update ([addresses.controller.ts:46](../../../services/commerce-api/src/modules/users/addresses/addresses.controller.ts#L46))                                      |
| DELETE | /api/v1/users/me/addresses/:id         | Authenticated | Second call returns 404          | Hard delete, 204 ([addresses.controller.ts:55](../../../services/commerce-api/src/modules/users/addresses/addresses.controller.ts#L55))                                    |
| POST   | /api/v1/users/me/addresses/:id/default | Authenticated | Naturally idempotent             | Make this the only default ([addresses.controller.ts:64](../../../services/commerce-api/src/modules/users/addresses/addresses.controller.ts#L64))                          |

Response shape: the profile goes through `toUserProfile`, which leaves out `passwordHash`, `isActive`, `emailVerifiedAt` and the timestamps ([user-profile.ts:12](../../../services/commerce-api/src/modules/users/user-profile.ts#L12)). Address routes return the raw Prisma `Address` row.

## Services

| Service                                                                                                                      | Responsibility                                                                                | Key public methods                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UsersService` ([users.service.ts](../../../services/commerce-api/src/modules/users/users.service.ts))                       | User row access and identity helpers. Methods that take a `tx` join the caller's transaction. | `findAccessById(id, tx?)` ([:10](../../../services/commerce-api/src/modules/users/users.service.ts#L10)), `promoteCustomerToSeller(id, tx)` ([:20](../../../services/commerce-api/src/modules/users/users.service.ts#L20)), `findByEmail` ([:30](../../../services/commerce-api/src/modules/users/users.service.ts#L30)), `findById(id, tx?)` ([:36](../../../services/commerce-api/src/modules/users/users.service.ts#L36)), `create(email, hash, tx?)` ([:43](../../../services/commerce-api/src/modules/users/users.service.ts#L43)), `updatePasswordHash(id, hash, tx?)` ([:53](../../../services/commerce-api/src/modules/users/users.service.ts#L53)), `updateProfile` ([:61](../../../services/commerce-api/src/modules/users/users.service.ts#L61)), `normalizeEmail` ([:68](../../../services/commerce-api/src/modules/users/users.service.ts#L68)) |
| `AddressesService` ([addresses.service.ts](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts)) | Owner-scoped address CRUD and the single-default rule.                                        | `findAll`, `findOne`, `create`, `update`, `remove`, `setDefault`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Business rules

**Identity**

- Emails are normalised with `trim().toLowerCase()` ([users.service.ts:68](../../../services/commerce-api/src/modules/users/users.service.ts#L68)), both on create ([:49](../../../services/commerce-api/src/modules/users/users.service.ts#L49)) and on lookup ([:32](../../../services/commerce-api/src/modules/users/users.service.ts#L32)). `User.email` is unique in the database.
- `promoteCustomerToSeller` only changes a user whose role is still `CUSTOMER` (`updateMany where role = CUSTOMER`), so STAFF/ADMIN/SELLER roles are never overwritten and a repeat call does nothing ([users.service.ts:24](../../../services/commerce-api/src/modules/users/users.service.ts#L24)).
- The profile DTO accepts `firstName` and `lastName` (non-empty string when present) and `phone` (any string). It has no format check ([update-profile.dto.ts:3](../../../services/commerce-api/src/modules/users/dto/update-profile.dto.ts#L3)). Email, role and password cannot be changed here.

**Addresses**

- Invariant: a user with at least one address has exactly one default ([addresses.service.ts:8](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L8)).
- Locking: `create`, `update`, `remove` and `setDefault` each run in one transaction that first locks the `users` row `FOR UPDATE`. That is the only lock address writes take, and `users` is first in the global lock order ([addresses.service.ts:105](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L105)). Concurrent first creates, promotions and deletes of the default therefore serialize per user.
- Ownership: `findOne` returns 404 both when the address does not exist and when it belongs to someone else, so the API never reveals whether an id exists ([addresses.service.ts:31](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L31)). `update`, `remove` and `setDefault` check ownership inside the locked transaction ([:147](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L147)).
- The first address a user creates becomes the default. Any `isDefault` in the body is not a DTO field, so the whitelist validation pipe rejects it, and `update` never changes the flag ([addresses.service.ts:41](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L41)). The default therefore moves only through `setDefault` or promotion, and "unset the only default" cannot be expressed.
- `setDefault` clears the current default and sets the new one in the same transaction ([addresses.service.ts:86](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L86)).
- Promotion ([addresses.service.ts:122](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L122)):
  - Deleting the default promotes the most recently updated remaining address, with id as the tie-breaker. Deleting the last address leaves none, without error.
  - `create` and `remove` also repair a legacy user who has addresses but no default, using the same rule.
- Database backstop: the partial unique index `addresses_one_default_per_user` (migration `20261008000000_transactional_shopping`) rejects a second default for the same user. It is not expressible in `schema.prisma`, so it lives only in the migration.
- Validation: `recipientName`, `line1`, `city` and `postalCode` are required and non-empty. `country` must be exactly 2 characters but its case is not checked. `label`, `phone`, `line2` and `region` are optional ([create-address.dto.ts:3](../../../services/commerce-api/src/modules/users/addresses/dto/create-address.dto.ts#L3)).

## Data

| Model     | Access                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| `User`    | Read/write (`create`, `update` of `passwordHash`/profile, role promotion)                                           |
| `Address` | Read/write. Cascades on user delete ([schema.prisma:196](../../../services/commerce-api/prisma/schema.prisma#L196)) |

## Dependencies

- Imports: `PrismaService` only. `UsersModule` imports `AddressesModule` ([users.module.ts:8](../../../services/commerce-api/src/modules/users/users.module.ts#L8)).
- `UsersService` is exported ([users.module.ts:11](../../../services/commerce-api/src/modules/users/users.module.ts#L11)) and consumed by `AuthModule` (all credential and session flows), `SellersModule` (`findAccessById`, `promoteCustomerToSeller`) and `PaymentsModule`.
- `AddressesService` is exported ([addresses.module.ts:9](../../../services/commerce-api/src/modules/users/addresses/addresses.module.ts#L9)) and consumed by `OrdersModule`.

## Jobs and events

None. Profile and address changes are not audited and publish no outbox events.

## Configuration

None.

## Tests

- [users.service.spec.ts](../../../services/commerce-api/src/modules/users/users.service.spec.ts): email normalisation on create and lookup; `updatePasswordHash` uses the supplied transaction.
- [addresses.service.spec.ts](../../../services/commerce-api/src/modules/users/addresses/addresses.service.spec.ts), [addresses.service.invariant.spec.ts](../../../services/commerce-api/src/modules/users/addresses/addresses.service.invariant.spec.ts): cross-user 404; first address becomes default; later addresses do not; default promoted on delete (updatedAt, then id); legacy zero-default repair; no default after the last address is deleted; `setDefault` clears the old default first; every write takes the user lock.
- [test/addresses.integration-spec.ts](../../../services/commerce-api/test/addresses.integration-spec.ts) (real PostgreSQL):
  - concurrent first creates and competing `setDefault` calls;
  - deleting the default while another address is created or promoted;
  - ownership inside the lock;
  - the partial unique index;
  - legacy zero-default repair under concurrency.

  Results: [Stage 7 verification](../transactional-shopping-verification.md#verification).
- [test/users.e2e-spec.ts](../../../services/commerce-api/test/users.e2e-spec.ts): profile update; auto-default and re-default over HTTP; cross-customer isolation.
- Untested: `promoteCustomerToSeller`, `findAccessById`, `updateProfile` validation edge cases.

## Known gaps

- A legacy user with addresses but no default is repaired only on their next address `create` or `remove` (or by `setDefault`); `update` does no repair. `scripts/check-transactional-shopping-preflight.cjs` lists such users as a warning.
- `country` is not uppercased or checked against ISO-3166. `phone` has no format check.
- `PATCH /users/me` returns a 500-class Prisma error (P2025) if the user row has been deleted, because `updateProfile` does not check that the row exists first ([users.service.ts:65](../../../services/commerce-api/src/modules/users/users.service.ts#L65)).
- There are two "who am I" endpoints with different shapes: `GET /auth/me` (`PublicUser` including `emailVerified`) and `GET /users/me` (`UserProfile`, which has names/phone but no verification flag).
