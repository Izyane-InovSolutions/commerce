# Backend baseline verification — 2026-09-30

Scope: documentation accuracy, isolated testing and backend CI only. Source checkpoint: `e386b94`, plus the uncommitted Step 1 configuration/documentation changes. No business logic or frontend changes are included. This is not a production-readiness certificate.

Status definitions are in the [current gap register](known-gaps.md#evidence-and-status-policy). The [acceptance matrix](../backend-acceptance-matrix.md#current-baseline-2026-09-30) links to this ledger. Every entry below is dated **2026-09-30**; source locations and tests are deliberately separate from execution results.

## Execution ledger

| Check | Status | Evidence and outcome |
| --- | --- | --- |
| Swagger consistency | fixed and verified | Generated contracts were reviewed and refreshed. `swagger:check` passes at 295 endpoints and 367 schemas. |
| HTTP test command | fixed and verified | `npm run test:e2e --workspace=@commerce/commerce-api`: 9 suites, 32 tests passed. The OpenAPI count assertion was aligned with the generated 295-operation contract. |
| Test provider isolation | fixed and verified | `node ../../node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand test-provider-env.e2e-spec.ts`: 1 test passed both in the clean copy and restored workspace. Scheduled workers and inherited live providers are disabled. |
| Database-name safeguards | fixed and verified | All 14 existing `integration-test.config.spec.ts` tests passed. Direct guard assertions also passed. `npm run test:integration` in the clean copy correctly refused missing `TEST_DATABASE_URL` / `TEST_DATABASE_NAME` during global setup, before migrations or connections. Does not prove database connectivity. |
| Compose / CI configuration | fixed and verified | YAML parsing and assertions passed for PostgreSQL 17, loopback 55432, database name, dedicated volume, absence of deployment env-file, Node 24, worker disabling and all seven matrix checks. Docker Desktop's WSL 2 Linux engine started the Compose service successfully and reported it healthy. CI runtime evidence remains separate below. |
| Formatting | fixed and verified | Existing backend formatting drift was normalized with the repository formatter. Full `format:check` passes. |
| Type checking | fixed and verified | `npm run typecheck --workspace=@commerce/commerce-api` passed against the clean dependency installation and current backend source/configuration. |
| Lint | fixed and verified | `npm run lint --workspace=@commerce/commerce-api -- --format json --output-file lint-results.json` passed: 541 files, 0 errors, 0 warnings in the clean installation. |
| Build | fixed and verified | `npm run build --workspace=@commerce/commerce-api` passed (295 endpoints, 367 schemas). The committed generated contract now matches the generator. |
| Full unit run | fixed and verified | `npm test --workspace=@commerce/commerce-api`: 98 suites, 984 tests passed. Jest timeout is 15 seconds across unit, HTTP and integration configurations so password hashing is reliable on slower runners; production behavior is unchanged. |
| Documentation links / patch whitespace | fixed and verified | 554 local Markdown file targets resolve; `git diff --check` passes. Historical report bodies are retained. Anchor fragments and external URLs were not validated. |
| Dependency installation | fixed and verified | Fresh temporary install from the unchanged root lockfile succeeded (895 packages, offline, lifecycle scripts disabled). Explicit Prisma generation passed in the workspace after an engine download. The clean backend dependency files were restored locally without copy errors. The initial in-place clean install hit Windows EPERM on an existing native binary; partially restored dependencies were excluded from test evidence. |
| Local PostgreSQL integration | fixed and verified | The dedicated Docker Compose PostgreSQL 17 service used `commerce_test`, disposable `commerce_test` credentials, loopback port 55432 and the separate `test-pgdata` volume. All 41 migrations applied; 15 suites and 71 tests passed on 2026-09-30. Neither deployment data nor application credentials were used. An earlier equivalent native PostgreSQL run produced the same result. |
| First GitHub Actions run | externally blocked | Workflow added locally; no remote workflow execution is claimed. Push/PR and runner access are needed for independent PostgreSQL evidence. |
| Live SMTP, S3, gateway and durability/load evidence | deferred | Outside Step 1. Source implementation and mocked tests cannot establish live service behavior. |

Preliminary checks interrupted by dependency installation, missing generated Prisma types, concurrent resource pressure, or incomplete temporary-copy configuration are excluded as test evidence. The final results above use the current workspace and isolated test configuration. The new workflow runs all requested checks strictly and independently; the first remote run remains a separate gate.

## Source-confirmed corrections

The [register correction table](known-gaps.md#corrected-baseline-2026-09-30) lists implementation and supporting tests for email delivery, outbox dispatch, payment reconciliation, S3 storage, media byte inspection, order cancellation and audit readers. These pre-existing features were not implemented by Step 1. Source review does not prove end-to-end delivery or concurrency behavior.

## Historical records

The [September 25 audit](../github-issues-backend-audit-2026-09-25.md) and [September release verification](../backend-release-1-verification.md) preserve their original bodies and dates, with links to the current register. Older successful runs and deferred-feature statements are not current checkout verification.
