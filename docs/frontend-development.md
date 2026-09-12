# Frontend development

Three Next.js App Router clients live under `apps/`. They share the Commerce
API, a typed API client, and one set of build presets, but each is its own
deployable. None of them holds business rules — authorization, pricing, and
state transitions are enforced by the API.

| App           | Workspace          | Port | Audience                              |
| ------------- | ------------------ | ---- | ------------------------------------- |
| `apps/web`    | `@commerce/web`    | 3001 | Public customer storefront            |
| `apps/admin`  | `@commerce/admin`  | 3002 | Internal staff, privileged operations |
| `apps/seller` | `@commerce/seller` | 3003 | Third-party sellers                   |

They are deliberately separate applications rather than route groups in one
app. The storefront is public, cacheable, and SEO-critical; the two portals are
authenticated, fully dynamic, and must not be indexed. Keeping them apart makes
"admin is not served from the storefront origin" an infrastructure guarantee
instead of a middleware detail, and lets each scale and deploy on its own.

## Requirements

- Node.js 24 or later
- npm 11 or later
- A running Commerce API (see [backend development](./backend-development.md))

## Install and run

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
cp apps/seller/.env.example apps/seller/.env.local
```

Start an API, then whichever clients you are working on, each in its own
terminal:

```bash
npm run mock:dev     # http://localhost:3000/api/v1  (or: npm run api:dev)

npm run web:dev      # http://localhost:3001
npm run admin:dev    # http://localhost:3002
npm run seller:dev   # http://localhost:3003
```

The API owns port 3000, so each client takes the next free port. Every client's
landing page reports whether it can reach `GET /api/v1/health` and which API
answered, which makes both a misconfigured `NEXT_PUBLIC_API_BASE_URL` and an
API that is not running visible immediately.

## Configuration

| Variable                   | Purpose                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the Commerce API, including the `/api/v1` prefix. Defaults to `http://localhost:3000/api/v1`, which both the mock and the real API serve. |

Only `NEXT_PUBLIC_*` variables reach the browser, and Next.js inlines them at
build time. Never put a secret in one. Server-only configuration belongs in an
unprefixed variable read from a server component or route handler.

## Checks

Run the repository checks from the repository root:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

`npm run build` type-checks each app as part of the build. The standalone
`npm run typecheck --workspace @commerce/web` script depends on the route types
Next.js generates into `.next/types`, so run a build before using it.

## Shared packages

### `@commerce/api-client`

All API access goes through this package. No app calls `fetch` against the API
directly.

```typescript
import { apiClient } from '@/lib/api';

const products = await apiClient.get<Product[]>('/products', {
  query: { q: 'desk', page: 2 },
});
```

Each app owns a `src/lib/api.ts` that builds its own client from
`createApiClient`, so credentials differ per app while the request behaviour
does not:

```typescript
export const apiClient = createApiClient({
  baseUrl: env.apiBaseUrl,
  getAuthHeaders: async () => ({
    authorization: `Bearer ${await readToken()}`,
  }),
});
```

`getAuthHeaders` is called per request, so a rotated token is always picked up.
The client resolves paths against the base URL, drops `null` and `undefined`
query parameters, and attaches an `x-request-id` correlation header to every
call so a browser failure can be matched to the API log entry. Pass
`idempotencyKey` for sensitive mutations, reusing one key across retries of a
single logical request.

Failures are typed: `ApiError` carries the HTTP status and the API's error body,
and `ApiUnreachableError` means the request never reached the API.

Endpoints get a thin typed function taking the client as its first argument,
grouped by domain in `catalog.ts`, `offers.ts`, and `inventory.ts`, rather than
callers passing raw paths around.

The package is published as TypeScript source and compiled by each app through
`transpilePackages`, so there is no build step to run before the apps.

### `@commerce/contracts`

The request and response contract for the Commerce API: Zod schemas plus the
types inferred from them. This is the seam with the backend team — when the
real API lands, this package is where the two definitions get reconciled, and
the type errors point at everything that needs to change.

Money never crosses the wire as a float. `Money` is an integer count of the
currency's minor unit, with `formatMoney` and `parseMoneyInput` for the edges.

The same schema is used in three places, so they cannot drift: validating a
form submission, validating URL query parameters, and validating a request in
the mock API.

### `@commerce/mock-api`

A stand-in Commerce API serving the contract from in-memory fixtures. It runs
as its own process, on the same address the real API uses:

```bash
npm run mock:dev     # http://localhost:3000/api/v1
```

Every client points at that one address, so all of them share one dataset — a
product created in admin is immediately offerable in seller, and the storefront
sees both. **Integrating is stopping this and starting the real API**
(`npm run api:dev`); no client configuration changes, because there is nothing
client-side to change. The two cannot run at once, which is the point: exactly
one thing is serving `/api/v1`.

`POST /__reset` returns the fixtures to their seed state, including accounts
and sessions.

Which API answered is not guessed from the URL. The mock adds `mock: true` to
its `/health` response and the real API omits it, so each portal's landing page
can say plainly whether it is showing fixture data.

Once the integration is done, delete this package and the `mock:dev` script.

### Talking to the real Commerce API

Both portals point at the NestJS API. The team's local setup runs it on
**port 3005** (`services/commerce-api/.env`), not the 3000 in `.env.example`.

```bash
npm run api:dev      # the real API, on the port its .env sets
npm run admin:dev    # http://localhost:3002
npm run seller:dev   # http://localhost:3003
```

Three facts about the API shape the client, and all three are handled in one
place rather than in every page:

- **Every response is wrapped** in `{ data, meta: { requestId } }`, and a
  paginated body wraps a second time. `createApiClient({ envelope: true })`
  strips the outer layer, and only an object with exactly `data` and `meta`
  counts as one — so a page body survives intact.
- **The admin and public catalog reads are not symmetrical.** The public read
  resolves `currentPrice`; the admin read returns the whole `prices` history
  and leaves the caller to pick. `pickCurrentPrice` mirrors the server's own
  rule so both agree.
- **The admin product list takes no query parameters** and returns the whole
  catalog as a bare array, while the public list is paginated. Searching and
  paging on the admin screen therefore happen in the page.

Backend-facing types live in `@commerce/contracts/backend.ts`, kept apart from
the marketplace contract the portals were first built against. Where the two
disagree the backend wins:

|                | Commerce API                                    | Marketplace contract              |
| -------------- | ----------------------------------------------- | --------------------------------- |
| Money          | `{ amount, currency }`                          | `{ amountMinor, currency }`       |
| Roles          | one string: `CUSTOMER`/`SELLER`/`STAFF`/`ADMIN` | an array of lowercase roles       |
| Product status | `DRAFT`/`PUBLISHED`/`ARCHIVED`                  | adds `pending` and `rejected`     |
| Sellable unit  | a variant                                       | a SKU                             |
| Stock location | a warehouse                                     | a location, possibly seller-owned |

### What is live, and what is not

Admin **catalog, categories, brands and inventory** are wired to real
endpoints. Every other admin section, and every seller trading section, renders
`AwaitingBackend`, which names the endpoints it needs. That is deliberate: an
empty table reads as "you have nothing" when the truth is "this does not
exist", and the two call for completely different actions.

**The seller portal has no backend beyond authentication.** The API has a
`SELLER` role and a nullable `Offer.sellerId`, but no seller table and no
seller-scoped endpoints — the schema notes sellers arrive in Phase 3.

To keep building seller screens against the stand-in instead, point that app
back at the mock:

```bash
# apps/seller/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1   # then: npm run mock:dev
```

## Authentication and roles

Mock authentication lives in the mock API. **It is not an auth system** —
passwords are compared in plain text and sessions are in memory. It exists so
the portals can be built against real session and role behaviour; the NestJS
auth module replaces all of it.

A portal signs in through `POST /auth/login`, which returns an access token
and a refresh token. Both are stored in httpOnly cookies and never reach the
browser; `src/lib/api.ts` attaches the access token to every request.

**Access tokens last fifteen minutes**, so a session needs renewing or the
portal signs itself out mid-afternoon. The access cookie is given the token's
own lifetime, which makes _access cookie gone, refresh cookie present_ the
signal to renew — no clock arithmetic anywhere. Renewal happens in
`middleware.ts`, because only middleware and route handlers may set cookies on
the way out; a server component cannot. A refresh that fails clears the refresh
cookie, so a spent token does not retry on every request.

**Each client must use its own cookie name.** Cookies are scoped by host and
ignore the port, so everything on localhost shares one cookie jar: a cookie
named `commerce_session` set by the admin portal on :3002 is also sent to the
seller portal on :3003. With a shared name, signing into one portal silently
replaces the other's session and you cannot be an admin in one tab and a
seller in another. The names are `commerce_admin_session` and
`commerce_seller_session`, each asserted by a test in its own app; a client
added later needs its own. Keep them distinct even once the portals have
separate hostnames, because a shared parent domain brings the clash straight
back.

Sessions are independent server-side too: signing out invalidates only the
token that was used, so closing one portal does not sign you out of the other.

`src/lib/session.ts` exposes the guards. They redirect so a signed-out visitor
gets a sign-in form instead of an error — **they are not the security boundary**.
The API enforces every rule independently, and the tests in
`packages/mock-api/src/auth.test.ts` assert that directly rather than through
the UI.

Roles are a list, because one person can be a shopper and a seller at once:

| Role       | Gets                                                                               |
| ---------- | ---------------------------------------------------------------------------------- |
| `customer` | The storefront. Every new account starts here.                                     |
| `seller`   | Their own offers, stock, and listings — scoped by the API to their seller account. |
| `admin`    | The catalog, the moderation queues, and seller accounts.                           |

Two rules are worth knowing because they are enforced server-side and cannot
be worked around from a client:

- **A seller's identity comes from their session, never the request.** Passing
  someone else's `sellerId` is a 403; another seller's offer is a 404, not a
  403, so the portal does not confirm it exists.
- **Nothing a client sends can grant a role.** Sign-up ignores `roles` and
  `sellerId` in the payload. Selling is granted only by an admin approving an
  application.

Development accounts, all with password `password123`:

| Email                       | Role                                        |
| --------------------------- | ------------------------------------------- |
| `admin@commerce.test`       | admin                                       |
| `seller@deskworks.test`     | approved seller                             |
| `seller@harboursupply.test` | approved seller                             |
| `shopper@example.test`      | shopper, no store                           |
| `applicant@pinemoor.test`   | shopper with an application awaiting review |

### Onboarding and moderation

Two approval gates, both admin-only, both mirrored in the seller portal so the
seller sees where they stand:

```text
SHOPPER                     ADMIN                    STOREFRONT
sign up
apply to sell  ---------->  /sellers queue
                            approve  ---> seller account created,
                                          seller role granted
submit a product ------->   /catalog (pending)
place an offer              approve  ------------->  on sale
                            reject   ---> reason shown to the seller
```

A product is on sale only when it is **active** _and_ has an **active offer**
from an **approved seller**. All three are checked by the API in one place, so
suspending a seller pulls their listings immediately and no client has to
remember to filter.

This keeps README §32 intact: a seller submits a product and the platform owns
it once approved. What the seller owns is the offer against its SKU.

### `@commerce/config`

Build, lint, and test presets, so each app's config files stay one line:

```javascript
// apps/web/eslint.config.mjs
export { default } from '@commerce/config/eslint';
```

It provides `./eslint`, `./postcss`, `./vitest`, and `./tsconfig/next.json`.
Apps extend the tsconfig preset alongside the repository base:

```json
{
  "extends": ["../../tsconfig.base.json", "@commerce/config/tsconfig/next.json"]
}
```

Change a preset here and every client picks it up.

## Structure

```text
apps/<app>/src/
├── app/          # App Router routes, layouts, and route-level metadata
├── components/   # Shared presentational and container components
│   └── ui/       # shadcn/ui primitives, owned by this app
└── lib/
    ├── api.ts    # The app's configured Commerce API client
    └── env.ts    # Public runtime configuration
```

The two portals additionally carry `src/lib/navigation.ts`, the single source of
truth for their section navigation. Add a section there and give it a matching
route under `src/app`.

## How a page works

Pages are server components that read their own filters from the URL. There is
no client-side data fetching and no store.

```typescript
const params = await searchParams;
const query = parseQueryParams(productListQuerySchema, params);
const result = await listProducts(apiClient, query);
```

`parseQueryParams` validates the URL against the contract schema and falls back
to its defaults, so a hand-edited address bar cannot break a render. Filter
forms are plain `GET` forms posting to the same route, which is why the portals
use a native `<select>` rather than a scripted listbox.

Writes are server actions in an `actions.ts` beside the route. An action calls
the API, revalidates the affected paths, and returns a `FormState`; the form
renders that state back through `useActionState`. `toFormState` splits the
API's `field: message` validation errors onto the fields that caused them, so
a rejected submission lands next to the input rather than in a banner.

A failed read renders `ApiErrorNotice` in place of the section rather than
taking down the page, and it shows the correlation id the request carried so a
portal failure can be matched to an API log entry.

Prefer server components. Add `'use client'` only for a component that needs
browser state, effects, or event handlers, and keep it as far down the tree as
possible.

## shadcn/ui

Each app owns its own copies in `src/components/ui`, so the storefront and the
portals can diverge — the portals will grow dense data tables the storefront
never needs. Add a component to one app:

```bash
npm exec --workspace @commerce/admin -- shadcn@latest add dialog
```

Newly added components arrive in the upstream formatting. Run
`npm run format --workspace @commerce/admin` afterwards so they match the
repository's Prettier settings.

## Who owns what

Three ownership rules run through the whole system, and they are enforced by
the API rather than by the clients:

| Thing              | Owner                                 |
| ------------------ | ------------------------------------- |
| The product record | The platform, once approved           |
| The price          | The seller, as an offer against a SKU |
| The stock          | Whoever physically holds it           |

The last one is why `InventoryLocation` has a `sellerId`. A platform fulfilment
centre has `null`; every approved seller gets their own location. A seller can
therefore manage their own quantities while a platform warehouse is invisible
to them — a reach into one answers **404, not 403**, so the API does not
confirm it exists.

Stock records are opened where stock is actually held: a platform product at
the platform's centres, a seller's submission at that seller's location, and a
new one whenever a seller prices a SKU they did not submit. Creating a row
everywhere would multiply empty rows by every seller on the platform.

### The taxonomy is administrative

Categories and brands are shared by every seller, so a seller cannot invent
them — one seller's private naming would make the taxonomy useless to the
rest. Reads are public because the storefront builds its navigation from them;
writes are admin-only, at **Categories** and **Brands** in the admin portal.

Nothing is cascaded on delete. An entry still referenced is refused with the
count, because silently re-parenting another seller's products is not a
decision an API should make for you:

| Attempt                                       | Result                      |
| --------------------------------------------- | --------------------------- |
| Delete a category with sub-categories         | 409, move them first        |
| Delete a category or brand in use             | 409, with how many products |
| Re-parent a category under its own descendant | 409, at any depth           |
| Duplicate slug                                | 409                         |

### When a seller needs one that does not exist

A seller names it on the submission rather than stopping to ask. The product
carries `proposedBrandName` / `proposedCategoryName`, nothing is added to the
shared taxonomy yet, and the seller carries on listing.

The decision belongs to the product review, not a queue of its own — the admin
already has the product in front of them, and a proposed name only means
anything in the context of what it is for. The review screen offers three
outcomes:

| Outcome                 | Effect                                                |
| ----------------------- | ----------------------------------------------------- |
| **Use an existing one** | Maps the proposal onto an entry that already exists   |
| **Create and attach**   | Adds it to the taxonomy, with a parent for a category |
| **Publish without one** | Leaves the product with no brand or category          |

"Use an existing one" is offered first because it is the common case — a
seller writing "Northwind Furniture" when the catalog already has "Northwind"
— and taking it is what stops the taxonomy filling with near-duplicates.

**A product cannot be approved while a proposal is unsettled.** Publishing
anyway would either lose what the seller told us or let an unreviewed name
reach the storefront, so the API refuses with the axis still outstanding
named. Dismissing is always available, so there is no way to get stuck.

The two are mutually exclusive per axis, enforced in the contract and in the
seller's form: picking an existing entry withdraws the proposal, and typing a
proposal clears the selection.

### A product is on sale only when all four hold

```text
product status = active          (an admin approved it)
offer status   = active          (the seller turned it on)
seller status  = approved        (not suspended or pending)
available > 0  at a location that offer can ship from
```

The last check reads the seller's own holding for a seller-fulfilled offer and
a platform centre otherwise. All four are evaluated in one place on the server,
so no client can put an unshippable listing in front of a shopper.

### The seller's Products section

The domain keeps products and offers apart; a seller does not think that way.
`GET /seller/catalog` flattens both into one row per SKU — what the item is,
what they charge, what they hold — covering SKUs they submitted _and_ SKUs they
only price. That is what "My Products" lists, with the tabs filtering on
product status.

A seller may edit their own submission while it is a draft, awaiting review, or
rejected. Editing a rejected product returns it to the queue and clears the
reason, which is how they answer the feedback. Once a product is live the
platform owns the record, and an edit is refused with an explanation rather
than silently ignored.

One trap worth knowing, because it bit twice: `schema.partial()` makes a field
optional but **keeps its default**, so a partial update arrives carrying
defaults for everything the caller never mentioned. `updateProductSchema` and
`updateSellerProductSchema` re-declare every defaulted field as plainly
optional, and there are tests pinning that — without it, editing a draft
submitted it for review and a partial admin edit wiped the description.

## Dashboard charts

Both dashboards lead with figures derived from catalog, offer and stock state.
**Nothing is trend-shaped, on purpose.** There is no orders domain and no time
dimension in the data, so a sales-over-time line would be invented rather than
measured. When orders land, that is what adds a time series — until then the
charts answer composition and comparison questions only.

`GET /seller/insights` and `GET /admin/insights` compute the figures on the
server, so a dashboard is one request rather than a client fetching every list
and joining it.

### The form follows the data's job

| Chart                               | The reader's question                     | Form          | Colour job                 |
| ----------------------------------- | ----------------------------------------- | ------------- | -------------------------- |
| Stock against reorder points        | which SKUs are under the line, by how far | diverging bar | diverging, warm/cool poles |
| Your price vs the best offer        | am I undercut, and by how much            | dumbbell      | one hue, two shades        |
| Why active products are not selling | what is blocking the catalog              | stacked bar   | status, with icon + label  |
| Catalog contribution                | who is filling the catalog                | bar           | one hue for every bar      |
| Competition per product             | how exposed is a listing to one seller    | bar           | ordinal ramp               |

Two rules that decided those choices, and are easy to get wrong:

- **Sellers have no natural order**, so every bar in "Catalog contribution"
  takes the same hue. Colouring them darker-where-bigger would re-encode the
  bar length and spend the identity channel on nothing.
- **Offer-count buckets do have an order** — one seller is genuinely less than
  three — so they take a one-hue ramp with monotone lightness, and the reader
  sees the order in the colour.

### Colour is computed, not chosen

Chart colours live in `--viz-*` tokens in `globals.css`, as roles rather than
hues, so a rebrand is one block. Every value was checked with a validator
against **this app's real card surface** (`#ffffff` light, `#171717` dark) — not
a generic one — for lightness band, chroma floor, contrast, and colourblind
separation. The ordinal ramp passes the ramp checks in both modes.

Two status fills sit below 3:1 on a white surface **by design**, so they carry
the relief channel the rule demands: an icon and a label in the legend, values
written beside the bar, and a table view.

### Every chart has a table-view twin

`ChartFrame` renders a `<details>` table under each chart. It is not optional —
a tooltip may enhance a chart but must never be the only way to read a value.
It is also why `<title>` hover tooltips are enough here: no client JavaScript,
and the values stay keyboard-reachable.

### Degenerate cases are not charts

A one-bar bar chart and a one-segment stacked bar are both misleading furniture.
When the data collapses to a single source or a single reason, the components
render the sentence instead — the number is the chart.

### SVG fills go through `style`, not attributes

`fill="var(--token)"` as a presentation _attribute_ does not reliably resolve
custom properties across browsers; `style={{ fill: 'var(--token)' }}` always
does. Every chart fill and stroke uses the style form.

## Branding

The admin portal carries the platform's own mark; the seller portal carries the
store's, because it is that store's back office and the header is how a seller
knows which account they are in.

`PlatformMark` is inline SVG rather than an asset: no network request, scales
cleanly, and it takes its colour from the surrounding text, so one component
covers light and dark.

A store's logo is `Seller.logoUrl`, and it is nullable. `SellerLogo` renders it
when present and otherwise draws a monogram from the store name — a brand-new
store has no logo, so the fallback is a designed state rather than an error.
It uses a plain `<img>`; the logo is a small fixed-size square from whatever
origin the API reports, so `next/image` would buy nothing but a
`images.remotePatterns` entry per storage host.

**Uploading a logo is not built.** Real logos belong in object storage
(README §29), so `logoUrl` is set by the backend. The mock generates a stable
monogram SVG per store at `/api/v1/sellers/:slug/logo.svg` to give the portals
a real remote URL to load, and deliberately leaves one seeded seller without a
logo so the fallback is exercised too.

## Naming conventions

- Route segments use lowercase kebab-case and map to user-facing URLs.
- TypeScript files use kebab-case; React components use PascalCase names.
- Tests sit beside the code they cover as `*.test.ts` / `*.test.tsx`.
- Design tokens live in `src/app/globals.css`; prefer a token over a raw colour.
