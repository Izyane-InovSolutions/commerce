Swagger UI is served at `/api/docs`; the OpenAPI JSON is at `/api/docs-json`.

`npm run swagger:generate` reads every controller's request and return types using
the TypeScript compiler, including aliases, generics and Prisma model fields.
It also reads validation constraints, parameter bindings, HTTP status codes,
public/optional authentication and role decorators. The generated JSON is checked
in so production only needs the compiled application, not the TypeScript compiler.
`createApiDocument` combines these contracts with Nest's actual route discovery
and rejects missing or stale endpoint entries.

Build and start scripts regenerate the contracts automatically. After changing
fields during a watch session, run `npm run swagger:generate` (or restart the dev
server). Run `npm run swagger:check` in CI to detect stale checked-in contracts.
Do not edit `contracts.generated.json` manually.

The generator explicitly handles the success/error envelopes, multipart media
uploads, binary downloads, guest token response headers and the pending payment
webhook contract. Update these overrides if their wire behavior changes. It fails
on unspecified `any`/`unknown` fields; JSON values and dictionary index signatures
remain open because their source contracts allow arbitrary data. New validation
decorators or transport conventions need corresponding generator support.

The payment webhook's external payload and signature format remain undefined
until the provider is integrated; the current implementation returns 503.
