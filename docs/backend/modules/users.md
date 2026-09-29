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

- Ownership: `findOne` returns 404 both when the address does not exist and when it belongs to someone else, so the API never reveals whether an id exists ([addresses.service.ts:22](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L22)). `update`, `remove` and `setDefault` all call `findOne` first.
- The first address a user creates becomes the default. Any `isDefault` in the body is not a DTO field, so the whitelist validation pipe rejects it ([addresses.service.ts:30](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L30)).
- Deleting the default address promotes the most recently updated remaining address to default. Deleting the last address leaves the user with no default ([addresses.service.ts:54](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L54)).
- `setDefault` clears every current default and sets the new one inside a single transaction ([addresses.service.ts:74](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L74)). "One default per user" is enforced only in application code; the database has no constraint for it ([schema.prisma:190](../../../services/commerce-api/prisma/schema.prisma#L190)).
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
- [addresses.service.spec.ts](../../../services/commerce-api/src/modules/users/addresses/addresses.service.spec.ts): cross-user 404; first address becomes default; later addresses do not; default promoted on delete; no default after the last address is deleted; `setDefault` clears the old default first; cross-user `setDefault` rejected.
- [test/users.e2e-spec.ts](../../../services/commerce-api/test/users.e2e-spec.ts): profile update; auto-default and re-default over HTTP; cross-customer isolation.
- Untested: `promoteCustomerToSeller`, `findAccessById`, `updateProfile` validation edge cases, concurrent `create` or `setDefault`.

## Known gaps

- `AddressesService.create` counts existing addresses and then inserts, outside a transaction ([addresses.service.ts:30](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L30)). Two concurrent first-address creates can both become default. There is no DB constraint to stop it.
- `remove` deletes the address and then promotes the next default in separate statements, outside a transaction ([addresses.service.ts:52](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L52)).
- `findOne` and `setDefault`'s ownership check run before the transaction starts, and the update inside it is keyed only by `id` ([addresses.service.ts:72](../../../services/commerce-api/src/modules/users/addresses/addresses.service.ts#L72)).
- `country` is not uppercased or checked against ISO-3166. `phone` has no format check.
- `PATCH /users/me` returns a 500-class Prisma error (P2025) if the user row has been deleted, because `updateProfile` does not check that the row exists first ([users.service.ts:65](../../../services/commerce-api/src/modules/users/users.service.ts#L65)).
- There are two "who am I" endpoints with different shapes: `GET /auth/me` (`PublicUser` including `emailVerified`) and `GET /users/me` (`UserProfile`, which has names/phone but no verification flag).
