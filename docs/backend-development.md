# Backend development

The Commerce API is a NestJS modular monolith in `services/commerce-api`. It uses
TypeScript, PostgreSQL, and Prisma.

## Requirements

- Node.js 24 or later
- npm 11 or later
- PostgreSQL

## Install and run

```bash
npm install
copy services/commerce-api/.env.example services/commerce-api/.env
npm run api:dev
```

The health endpoint is available at `GET /api/v1/health`.

## Checks

Run the repository checks from the repository root:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

## Module boundaries

Business capabilities belong under `src/modules`. Each module owns its HTTP
controllers, application services, validation, authorization policies, and data
access. A module must use another module through an exported service or explicit
interface; it must not access another module's database implementation directly.

Shared HTTP and domain primitives belong in `src/common`. Prisma configuration
belongs in `src/database`. External provider adapters belong in
`src/integrations`, and process-level concerns belong in `src/infrastructure`.

## Naming conventions

- HTTP routes use plural kebab-case nouns beneath `/api/v1`.
- TypeScript files use kebab-case and conventional NestJS suffixes.
- Prisma models use singular PascalCase names and fields use camelCase.
- Database tables and columns are mapped to plural snake_case names.
- Migration names use a lowercase descriptive phrase with underscores.
- Public identifiers are UUIDs and timestamps are stored in UTC.
