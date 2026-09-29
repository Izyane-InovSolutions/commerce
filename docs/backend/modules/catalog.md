# Catalog

> Admin-managed taxonomy that products hang off: a category tree, a flat brand list, and attributes with their allowed values.

## Purpose and features

- **Staff and admins** create, edit and delete categories (a tree via `parentId`, ordered by `position`), brands, and attributes with their values (for example `color` -> `Red`, `Blue`).
- **Anyone** lists categories and brands and reads one by slug. A category read by slug includes its direct children.
- **Attributes have no public route.** Shoppers see them only through product responses, where each variant carries its attribute values (see [products.md](products.md)).
- **Other modules** only consume the tables: products reference `categoryId`/`brandId`, variants link to `AttributeValue` rows, and the public product search filters by `categorySlug`, `brandSlug` and `attributeValueId`.

`CatalogModule` is only a wrapper that imports `CategoriesModule`, `BrandsModule` and `AttributesModule` ([catalog.module.ts:8](../../../services/commerce-api/src/modules/catalog/catalog.module.ts#L8)).

## Routes

Conventions (prefix, guards, envelope): see [../architecture.md](../architecture.md) and [../auth-and-access.md](../auth-and-access.md). Admin controllers carry `@Roles(Role.STAFF, Role.ADMIN)` at class level; public controllers carry `@Public()` at class level. `:id`/`:valueId` go through `ParseUUIDPipe`; `:slug` is not validated.

| Method | Path                                                 | Access              | Idempotency                                 | Description                                                                                                                                                                    |
| ------ | ---------------------------------------------------- | ------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | /api/v1/catalog/categories                           | Public              | n/a                                         | All categories, flat, `position asc, name asc` ([categories.controller.ts:12](../../../services/commerce-api/src/modules/catalog/categories/categories.controller.ts#L12))     |
| GET    | /api/v1/catalog/categories/:slug                     | Public              | n/a                                         | One category with its direct `children` ([categories.controller.ts:17](../../../services/commerce-api/src/modules/catalog/categories/categories.controller.ts#L17))            |
| GET    | /api/v1/admin/catalog/categories                     | Roles(STAFF, ADMIN) | n/a                                         | Same list as the public route ([admin-categories.controller.ts:25](../../../services/commerce-api/src/modules/catalog/categories/admin-categories.controller.ts#L25))          |
| GET    | /api/v1/admin/catalog/categories/:id                 | Roles(STAFF, ADMIN) | n/a                                         | One category by id, no children ([admin-categories.controller.ts:30](../../../services/commerce-api/src/modules/catalog/categories/admin-categories.controller.ts#L30))        |
| POST   | /api/v1/admin/catalog/categories                     | Roles(STAFF, ADMIN) | None (unique `slug` -> 409)                 | Create ([admin-categories.controller.ts:35](../../../services/commerce-api/src/modules/catalog/categories/admin-categories.controller.ts#L35))                                 |
| PATCH  | /api/v1/admin/catalog/categories/:id                 | Roles(STAFF, ADMIN) | Naturally idempotent                        | Partial update, including reparenting ([admin-categories.controller.ts:40](../../../services/commerce-api/src/modules/catalog/categories/admin-categories.controller.ts#L40))  |
| DELETE | /api/v1/admin/catalog/categories/:id                 | Roles(STAFF, ADMIN) | Second call returns 404                     | Hard delete, 204 ([admin-categories.controller.ts:48](../../../services/commerce-api/src/modules/catalog/categories/admin-categories.controller.ts#L48))                       |
| GET    | /api/v1/catalog/brands                               | Public              | n/a                                         | All brands, `name asc` ([brands.controller.ts:12](../../../services/commerce-api/src/modules/catalog/brands/brands.controller.ts#L12))                                         |
| GET    | /api/v1/catalog/brands/:slug                         | Public              | n/a                                         | One brand by slug ([brands.controller.ts:17](../../../services/commerce-api/src/modules/catalog/brands/brands.controller.ts#L17))                                              |
| GET    | /api/v1/admin/catalog/brands                         | Roles(STAFF, ADMIN) | n/a                                         | All brands ([admin-brands.controller.ts:25](../../../services/commerce-api/src/modules/catalog/brands/admin-brands.controller.ts#L25))                                         |
| GET    | /api/v1/admin/catalog/brands/:id                     | Roles(STAFF, ADMIN) | n/a                                         | One brand by id ([admin-brands.controller.ts:30](../../../services/commerce-api/src/modules/catalog/brands/admin-brands.controller.ts#L30))                                    |
| POST   | /api/v1/admin/catalog/brands                         | Roles(STAFF, ADMIN) | None (unique `slug` -> 409)                 | Create ([admin-brands.controller.ts:35](../../../services/commerce-api/src/modules/catalog/brands/admin-brands.controller.ts#L35))                                             |
| PATCH  | /api/v1/admin/catalog/brands/:id                     | Roles(STAFF, ADMIN) | Naturally idempotent                        | Partial update ([admin-brands.controller.ts:40](../../../services/commerce-api/src/modules/catalog/brands/admin-brands.controller.ts#L40))                                     |
| DELETE | /api/v1/admin/catalog/brands/:id                     | Roles(STAFF, ADMIN) | Second call returns 404                     | Hard delete, 204 ([admin-brands.controller.ts:48](../../../services/commerce-api/src/modules/catalog/brands/admin-brands.controller.ts#L48))                                   |
| GET    | /api/v1/admin/catalog/attributes                     | Roles(STAFF, ADMIN) | n/a                                         | All attributes with values, `name asc` ([admin-attributes.controller.ts:26](../../../services/commerce-api/src/modules/catalog/attributes/admin-attributes.controller.ts#L26)) |
| GET    | /api/v1/admin/catalog/attributes/:id                 | Roles(STAFF, ADMIN) | n/a                                         | One attribute with values ([admin-attributes.controller.ts:31](../../../services/commerce-api/src/modules/catalog/attributes/admin-attributes.controller.ts#L31))              |
| POST   | /api/v1/admin/catalog/attributes                     | Roles(STAFF, ADMIN) | None (unique `code` -> 409)                 | Create ([admin-attributes.controller.ts:38](../../../services/commerce-api/src/modules/catalog/attributes/admin-attributes.controller.ts#L38))                                 |
| PATCH  | /api/v1/admin/catalog/attributes/:id                 | Roles(STAFF, ADMIN) | Naturally idempotent                        | Rename / recode ([admin-attributes.controller.ts:43](../../../services/commerce-api/src/modules/catalog/attributes/admin-attributes.controller.ts#L43))                        |
| DELETE | /api/v1/admin/catalog/attributes/:id                 | Roles(STAFF, ADMIN) | Second call returns 404                     | Hard delete with its values, 204 ([admin-attributes.controller.ts:51](../../../services/commerce-api/src/modules/catalog/attributes/admin-attributes.controller.ts#L51))       |
| POST   | /api/v1/admin/catalog/attributes/:id/values          | Roles(STAFF, ADMIN) | None (unique `(attributeId, value)` -> 409) | Add a value ([admin-attributes.controller.ts:57](../../../services/commerce-api/src/modules/catalog/attributes/admin-attributes.controller.ts#L57))                            |
| PATCH  | /api/v1/admin/catalog/attributes/:id/values/:valueId | Roles(STAFF, ADMIN) | Naturally idempotent                        | Rename a value ([admin-attributes.controller.ts:65](../../../services/commerce-api/src/modules/catalog/attributes/admin-attributes.controller.ts#L65))                         |
| DELETE | /api/v1/admin/catalog/attributes/:id/values/:valueId | Roles(STAFF, ADMIN) | Second call returns 404                     | Delete a value, 204 ([admin-attributes.controller.ts:74](../../../services/commerce-api/src/modules/catalog/attributes/admin-attributes.controller.ts#L74))                    |

All routes return raw Prisma rows (`Category`, `Brand`, `Attribute` with `values`).

## Services

| Service                                                                                                                            | Responsibility                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CategoriesService` ([categories.service.ts](../../../services/commerce-api/src/modules/catalog/categories/categories.service.ts)) | CRUD, parent existence check, cycle prevention (`assertNotDescendant`, [:84](../../../services/commerce-api/src/modules/catalog/categories/categories.service.ts#L84)).       |
| `BrandsService` ([brands.service.ts](../../../services/commerce-api/src/modules/catalog/brands/brands.service.ts))                 | CRUD.                                                                                                                                                                         |
| `AttributesService` ([attributes.service.ts](../../../services/commerce-api/src/modules/catalog/attributes/attributes.service.ts)) | Attribute CRUD and value CRUD scoped to the parent attribute (`findValue`, [:105](../../../services/commerce-api/src/modules/catalog/attributes/attributes.service.ts#L105)). |

Each service is exported by its module, but nothing outside `catalog/` injects them today.

## Business rules

**Validation**

- Slugs (category, brand) use `@IsSlug`: `^[a-z0-9]+(-[a-z0-9]+)*$` ([slug.ts:4](../../../services/commerce-api/src/common/catalog/slug.ts#L4)). Attribute `code` uses the same pattern inline ([create-attribute.dto.ts:9](../../../services/commerce-api/src/modules/catalog/attributes/dto/create-attribute.dto.ts#L9)).
- `name` and attribute `value` must be non-empty strings; there are no maximum lengths anywhere in this module.
- Category create accepts `name`, `slug`, `description?`, `parentId?` (UUID) ([create-category.dto.ts:5](../../../services/commerce-api/src/modules/catalog/categories/dto/create-category.dto.ts#L5)). `position` can only be set on update ([update-category.dto.ts:32](../../../services/commerce-api/src/modules/catalog/categories/dto/update-category.dto.ts#L32)); `parentId: null` moves a category to the root ([update-category.dto.ts:28](../../../services/commerce-api/src/modules/catalog/categories/dto/update-category.dto.ts#L28)).
- `description` cannot be cleared back to `null` on either category or brand (the DTOs accept only strings).

**Uniqueness**

- Any Prisma P2002 on write maps to 409: category/brand slug ([categories.service.ts:106](../../../services/commerce-api/src/modules/catalog/categories/categories.service.ts#L106), [brands.service.ts:63](../../../services/commerce-api/src/modules/catalog/brands/brands.service.ts#L63)), attribute code, and `(attributeId, value)` ([attributes.service.ts:79](../../../services/commerce-api/src/modules/catalog/attributes/attributes.service.ts#L79)). Other errors are rethrown unchanged.

**Category tree**

- On create and update, a given `parentId` must exist (404 otherwise) ([categories.service.ts:47](../../../services/commerce-api/src/modules/catalog/categories/categories.service.ts#L47), [:66](../../../services/commerce-api/src/modules/catalog/categories/categories.service.ts#L66)).
- A category cannot be its own parent (400) ([categories.service.ts:62](../../../services/commerce-api/src/modules/catalog/categories/categories.service.ts#L62)) nor be moved under one of its descendants: the service walks up from the candidate parent to the root, one query per level, and 400s if it meets `id` ([categories.service.ts:88](../../../services/commerce-api/src/modules/catalog/categories/categories.service.ts#L88)).
- There is no depth limit, and the tree check is not transactional.

**Attribute values**

- A value is addressed through its attribute: if `valueId` belongs to a different attribute, update and delete return 404 ([attributes.service.ts:113](../../../services/commerce-api/src/modules/catalog/attributes/attributes.service.ts#L113)).

**Deletes** (all hard deletes after a `findById` 404 check; the effect on related rows comes from the schema)

- Category: children get `parentId = NULL` and become roots; products get `categoryId = NULL` ([schema.prisma:431](../../../services/commerce-api/prisma/schema.prisma#L431), [:485](../../../services/commerce-api/prisma/schema.prisma#L485)).
- Brand: products get `brandId = NULL` ([schema.prisma:483](../../../services/commerce-api/prisma/schema.prisma#L483)).
- Attribute: cascades to its values ([schema.prisma:468](../../../services/commerce-api/prisma/schema.prisma#L468)); a value delete cascades to `ProductVariantAttributeValue`, so variants silently lose that attribute ([schema.prisma:540](../../../services/commerce-api/prisma/schema.prisma#L540)).

## Data

| Model            | Access                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Category`       | Read/write. Self-relation `CategoryHierarchy`, `slug` unique ([schema.prisma:425](../../../services/commerce-api/prisma/schema.prisma#L425)) |
| `Brand`          | Read/write. `slug` unique ([schema.prisma:442](../../../services/commerce-api/prisma/schema.prisma#L442))                                    |
| `Attribute`      | Read/write. `code` unique ([schema.prisma:454](../../../services/commerce-api/prisma/schema.prisma#L454))                                    |
| `AttributeValue` | Read/write. Unique `(attributeId, value)` ([schema.prisma:473](../../../services/commerce-api/prisma/schema.prisma#L473))                    |

## Dependencies

- Imports: `PrismaService` only. No other feature module is imported, and none imports these modules except `AppModule` via `CatalogModule`.

## Jobs and events

None. No audit rows, outbox topics or jobs are written for taxonomy changes.

## Configuration

None.

## Tests

- [categories.service.spec.ts](../../../services/commerce-api/src/modules/catalog/categories/categories.service.spec.ts): not-found, P2002 -> 409, self-parent, descendant cycle, reparent to an unrelated category.
- [brands.service.spec.ts](../../../services/commerce-api/src/modules/catalog/brands/brands.service.spec.ts): P2002 -> 409, non-P2002 errors preserved, no update of an unknown row.
- [attributes.service.spec.ts](../../../services/commerce-api/src/modules/catalog/attributes/attributes.service.spec.ts): value belonging to another attribute is 404 for update/delete; duplicate value -> 409.
- [test/catalog.e2e-spec.ts](../../../services/commerce-api/test/catalog.e2e-spec.ts): customer creating a category gets 403; category and brand are created over HTTP as part of the draft-to-published product walk.
- Untested: delete side effects (SetNull / cascade), `position` ordering, concurrent reparenting.

## Known gaps

- Deleting an `AttributeValue` (or a whole `Attribute`) cascades into `ProductVariantAttributeValue`, stripping the value from published variants with no warning or usage check ([schema.prisma:540](../../../services/commerce-api/prisma/schema.prisma#L540)).
- Deleting a category orphans its children to the root instead of refusing or re-parenting them to the deleted node's parent ([schema.prisma:431](../../../services/commerce-api/prisma/schema.prisma#L431)).
- Deletes are check-then-delete without mapping P2025, so a concurrent delete surfaces as a 500 instead of 404 ([categories.service.ts:77](../../../services/commerce-api/src/modules/catalog/categories/categories.service.ts#L77), [brands.service.ts:58](../../../services/commerce-api/src/modules/catalog/brands/brands.service.ts#L58), [attributes.service.ts:63](../../../services/commerce-api/src/modules/catalog/attributes/attributes.service.ts#L63)).
- The cycle check reads ancestors outside a transaction; two concurrent reparents can still create a cycle ([categories.service.ts:84](../../../services/commerce-api/src/modules/catalog/categories/categories.service.ts#L84)).
- No lengths or max sizes on `name`, `description` or `value`; no `version` column, so concurrent edits are last-write-wins.
- Product search by `categorySlug` matches that exact category only, not its descendants ([products.service.ts:850](../../../services/commerce-api/src/modules/products/products.service.ts#L850)).
- Taxonomy changes are not audited, and the list endpoints are unpaginated.
