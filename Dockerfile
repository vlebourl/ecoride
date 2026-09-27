# ---- Stage 1: Build client ----
FROM oven/bun:1-alpine AS build

ARG GIT_HASH=

WORKDIR /app

# Copier les manifests (cache layer)
COPY package.json bun.lock ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/

RUN bun install --frozen-lockfile

# Copier le code source
COPY shared/ shared/
COPY client/ client/
COPY server/ server/
COPY tsconfig.json drizzle.config.ts ./

# Build du client (Vite) — GIT_HASH passed as env for version display
ENV GIT_HASH=$GIT_HASH
RUN cd client && bun run build

# ---- Stage 2: Runtime ----
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

# Bust BuildKit cache for COPY --from=build layers
# Without this, BuildKit caches the runtime stage even when the build stage changed
ARG CACHEBUST=1

# Install only the server's production dependency graph. Its drizzle-kit
# dependency runs the migrations at startup.
COPY package.json bun.lock ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/
RUN bun install --filter server --production --frozen-lockfile --ignore-scripts

COPY --from=build /app/shared shared/
COPY --from=build /app/server/src server/src/
COPY --from=build /app/server/scripts server/scripts/
COPY --from=build /app/server/drizzle server/drizzle/
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/drizzle.config.ts ./

ENV NODE_ENV=production

EXPOSE 3000

USER bun

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/health`).then(async r => { const h = await r.json(); process.exit(r.ok && h.db === true ? 0 : 1) }).catch(() => process.exit(1))"]

CMD ["bun", "--cwd", "server", "scripts/start-production.ts"]
