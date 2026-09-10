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

npm run web:dev      # http://localhost:3001
npm run admin:dev    # http://localhost:3002
npm run seller:dev   # http://localhost:3003
```

The API owns port 3000, so each client takes the next free port. Every client's
landing page reports whether it can reach `GET /api/v1/health`, which makes a
misconfigured `NEXT_PUBLIC_API_BASE_URL` visible immediately.

## Configuration

| Variable                   | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the Commerce API, including the `/api/v1` prefix. |

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

Endpoints get a thin typed function taking the client as its first argument —
`getHealth` is the worked example — rather than callers passing raw paths around.

The package is published as TypeScript source and compiled by each app through
`transpilePackages`, so there is no build step to run before the apps.

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

## Naming conventions

- Route segments use lowercase kebab-case and map to user-facing URLs.
- TypeScript files use kebab-case; React components use PascalCase names.
- Tests sit beside the code they cover as `*.test.ts` / `*.test.tsx`.
- Design tokens live in `src/app/globals.css`; prefer a token over a raw colour.
