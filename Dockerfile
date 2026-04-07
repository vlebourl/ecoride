# ---- Stage 1: Build client ----
FROM oven/bun:1-alpine AS build

ARG GIT_HASH=

WORKDIR /app

# Copier les manifests (cache layer)
COPY package.json bun.lock ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/

RUN bun install

# Copier le code source
COPY shared/ shared/
COPY client/ client/
COPY server/ server/
COPY tsconfig.json drizzle.config.ts ./

# Build du client (Vite) — GIT_HASH passed as env for version display
ENV GIT_HASH=$GIT_HASH
RUN cd client && bun run build

# Keep full node_modules (drizzle-kit needed at runtime for migrations)

# ---- Stage 2: Runtime ----
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

# Bust BuildKit cache for COPY --from=build layers
# Without this, BuildKit caches the runtime stage even when the build stage changed
ARG CACHEBUST=1

# Copier tout depuis le build stage (node_modules inclus, avec drizzle-kit)
COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/shared shared/
COPY --from=build /app/server server/
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/drizzle.config.ts ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "bun --cwd server scripts/start-production.ts"]
