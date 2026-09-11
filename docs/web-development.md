# Web development

The customer storefront is a Next.js App Router application in `apps/web`. It
uses TypeScript, Tailwind CSS, and shadcn/ui, and it is a pure client of the
Commerce API — it holds no business rules of its own.

## Requirements

- Node.js 24 or later
- npm 11 or later
- A running Commerce API (see [backend development](./backend-development.md))

## Install and run

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run web:dev
```

The storefront runs on <http://localhost:3001> so it does not collide with the
API on port 3000. The home page reports whether it can reach
`GET /api/v1/health`, which makes a misconfigured `NEXT_PUBLIC_API_BASE_URL`
visible immediately.

## Configuration

| Variable | Purpose |
| --- | --- |
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

`npm run build` type-checks the app as part of the build. The standalone
`npm run typecheck --workspace @commerce/web` script depends on the route types
Next.js generates into `.next/types`, so run a build before using it.

## Calling the API

All API access goes through `src/lib/api/client.ts`. Nothing else in the app
should call `fetch` against the API directly.

```typescript
import { apiFetch } from '@/lib/api/client';

const products = await apiFetch<Product[]>('/products', {
  query: { q: 'desk', page: 2 },
});
```

The client resolves paths against `NEXT_PUBLIC_API_BASE_URL`, drops `null` and
`undefined` query parameters, and attaches an `x-request-id` correlation header
to every call so a browser failure can be matched to the API log entry. Pass
`idempotencyKey` for sensitive mutations; reuse the same key across retries of
one logical request.

Failures are typed. `ApiError` carries the HTTP status and the API's error body;
`ApiUnreachableError` means the request never reached the API. Both are exported
from `src/lib/api/errors.ts`.

Each domain gets a thin typed module beside the client — `src/lib/api/health.ts`
is the worked example — rather than callers passing raw paths around.

## Structure

```text
apps/web/src/
├── app/          # App Router routes, layouts, and route-level metadata
├── components/   # Shared presentational and container components
│   └── ui/       # shadcn/ui primitives, owned by this repository
└── lib/
    ├── api/      # Commerce API client and per-domain request modules
    └── env.ts    # Public runtime configuration
```

Prefer server components. Add `'use client'` only for a component that needs
browser state, effects, or event handlers, and keep it as far down the tree as
possible.

## shadcn/ui

Components are copied into `src/components/ui` and are ours to edit:

```bash
npm exec --workspace @commerce/web -- shadcn@latest add dialog
```

Newly added components arrive in the upstream formatting. Run
`npm run format --workspace @commerce/web` afterwards so they match the
repository's Prettier settings.

## Naming conventions

- Route segments use lowercase kebab-case and map to customer-facing URLs.
- TypeScript files use kebab-case; React components use PascalCase names.
- Tests sit beside the code they cover as `*.test.ts` / `*.test.tsx`.
- Design tokens live in `src/app/globals.css`; prefer a token over a raw colour.
