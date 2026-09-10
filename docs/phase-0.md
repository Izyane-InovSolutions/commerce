# Phase 0 backend foundation

Phase 0 establishes the backend platform and stops before catalog, cart,
checkout, or order behavior.

## Delivered

- NestJS modular monolith with TypeScript and `/api/v1` versioning.
- PostgreSQL persistence and repeatable Prisma migrations.
- Validated environment configuration, request validation, standard response
  and error envelopes, request IDs, security headers, and graceful shutdown.
- Liveness, readiness, process metrics, structured redacted logging, Swagger,
  and immutable audit events.
- JWT access tokens, rotating refresh sessions, password reset, roles,
  ownership hooks, and throttling for sensitive endpoints.
- PostgreSQL-backed expiring cache entries, retryable background jobs,
  dead-letter state, and transactional outbox events.
- Local filesystem media provider with metadata, ownership checks, file limits,
  and signed upload/download URLs.
- Payment provider interface and an unavailable placeholder ready for the
  external payment API contract. No payment behavior or schema is assumed yet.
- Automated backend CI for formatting, linting, tests, build, Prisma validation,
  and migration deployment.

The application remains local-only. No hosted database, deployment platform,
Redis, or cloud object storage is required.
