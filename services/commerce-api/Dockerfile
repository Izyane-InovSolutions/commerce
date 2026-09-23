# syntax=docker/dockerfile:1

# The build context is the REPO ROOT, not this directory: package-lock.json
# lives there and `npm ci` will not run without it. Build with
#
#   docker build -f services/commerce-api/Dockerfile .
#
# or let deploy/docker-compose.yml do it, which already sets the context.
#
# Debian rather than Alpine because Prisma's query engine links against
# OpenSSL and glibc; the musl builds are supported but are a recurring source
# of "engine not found" failures at boot, which is a bad trade for ~60MB.

# ---------------------------------------------------------------- dependencies
FROM node:24-bookworm-slim AS deps
WORKDIR /repo

# Must be present before `prisma generate` runs in the build stage below.
# Prisma picks its query engine by sniffing the OpenSSL version at generate
# time; with no libssl to find it guesses openssl-1.1.x, and the runtime stage
# — which does have OpenSSL 3 — then demands a 3.0.x engine that was never
# emitted. The client and the runtime have to agree, so both install it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Manifests only, so this layer stays cached until a dependency actually
# changes. --workspace installs just the API's tree: without it npm would pull
# Next, React and the whole frontend toolchain into the image as well.
COPY package.json package-lock.json ./
COPY services/commerce-api/package.json services/commerce-api/
RUN npm ci --ignore-scripts \
      --workspace @commerce/commerce-api \
      --include-workspace-root

# ---------------------------------------------------------------------- build
FROM deps AS build
WORKDIR /repo
# The service's tsconfig.json does `extends: "../../tsconfig.base.json"`, and
# that file carries `strict`, `target` and `noUncheckedIndexedAccess`. Without
# it TypeScript silently falls back to its own defaults and compiles the whole
# API unstrict — it does not fail loudly, it just builds something different.
COPY tsconfig.base.json ./
COPY services/commerce-api ./services/commerce-api
WORKDIR /repo/services/commerce-api

# `npm ci` ran with --ignore-scripts, so the package's own postinstall hook
# never fired. Generating here instead pins the query engine to this image's
# platform rather than whatever machine built it.
RUN npx prisma generate

# Runs scripts/generate-openapi.cjs and then `nest build`. Pure static
# analysis over the TypeScript AST — it needs no database to be reachable.
RUN npm run build

# -------------------------------------------------------------------- runtime
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo

# The runtime half of the pairing described in the deps stage: the engine
# generated there links against OpenSSL 3, so it has to exist here too.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# A second, production-only install: this drops tsc, the Nest CLI, jest and
# eslint rather than carrying them into the image that faces the internet.
COPY package.json package-lock.json ./
COPY services/commerce-api/package.json services/commerce-api/
RUN npm ci --omit=dev --ignore-scripts \
      --workspace @commerce/commerce-api \
      --include-workspace-root \
 && npm cache clean --force

# The Prisma client is generated code, not a published package, so a plain
# install does not produce it. It is copied from the build stage because
# regenerating it here would mean shipping the Prisma CLI too.
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /repo/node_modules/@prisma/client ./node_modules/@prisma/client

COPY --from=build /repo/services/commerce-api/dist ./services/commerce-api/dist
# The schema and migration history ride along so this image can also serve as
# the migration runner (see the `migrate` service in docker-compose.yml).
COPY --from=build /repo/services/commerce-api/prisma ./services/commerce-api/prisma

# Uploaded media is written at runtime and has to outlive any single container,
# so this path is a mount point. It is created and chowned here so the volume
# inherits an ownership the unprivileged user can actually write to.
RUN mkdir -p /var/lib/commerce/media && chown -R node:node /var/lib/commerce

USER node
WORKDIR /repo/services/commerce-api
EXPOSE 3000

# main.ts calls enableShutdownHooks(), which only runs if SIGTERM reaches the
# process — so node must be PID 1's child under an init that forwards signals
# (`init: true` in compose), and must not be wrapped in a shell.
CMD ["node", "dist/main.js"]
