FROM oven/bun:1-slim AS base
WORKDIR /app

FROM base AS install

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS build

# NEXT_PUBLIC_* are inlined into the client bundle at build time, so the client
# PostHog SDK only initializes in production if the key is present *here*, during
# `bun run build`. Supplied as build args by docker-compose.yml (sourced from .env).
# Empty is fine - client telemetry stays a no-op when unset.

# Build-time environment variables
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST

# Make them available as environment variables during build
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST

COPY --from=install /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

RUN bun next telemetry disable
RUN bun run build

# Slim runtime: only the standalone server output + static assets.
FROM base AS runtime

ENV NODE_ENV=production

COPY --from=build --chown=bun:bun /app/public ./public
COPY --from=build --chown=bun:bun /app/.next/standalone ./
COPY --from=build --chown=bun:bun /app/.next/static ./.next/static

USER bun

EXPOSE 3000

CMD ["bun", "server.js"]

# Migrator/cron worker: lean deps only (no Next/React UI packages).
# Used as GHCR :migrator-latest for migrate + cron services.
FROM base AS install-worker

COPY package.worker.json ./package.json
RUN bun install

FROM base AS migrator

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates tzdata \
  && curl -fsSLO https://github.com/aptible/supercronic/releases/download/v0.2.36/supercronic-linux-amd64 \
  && chmod +x supercronic-linux-amd64 \
  && mv supercronic-linux-amd64 /usr/local/bin/supercronic \
  && apt-get purge -y curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=install-worker /app/node_modules ./node_modules
COPY package.worker.json ./package.json
COPY tsconfig.worker.json ./tsconfig.json
COPY scripts ./scripts
COPY data/migrations ./data/migrations
COPY lib ./lib
COPY crontab ./crontab

# Writable even when compose mounts a fresh volume over /app/logs (root-owned).
RUN mkdir -p /app/logs

CMD ["bun", "run", "db:migrate"]
