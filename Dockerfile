# ---- Stage 1: Build client ----
FROM oven/bun:1-alpine AS build

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
COPY tsconfig.json ./

# Build du client (Vite)
RUN cd client && bun run build

# ---- Stage 2: Runtime ----
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

# curl pour le healthcheck Docker
RUN apk add --no-cache curl

# Copier les manifests + install deps production
COPY package.json bun.lock ./
COPY shared/package.json shared/
COPY server/package.json server/

RUN bun install --frozen-lockfile --production

# Copier le code serveur + shared
COPY shared/ shared/
COPY server/ server/
COPY tsconfig.json ./

# Copier le build client depuis le stage build
COPY --from=build /app/client/dist client/dist

# Copier les migrations Drizzle
COPY drizzle.config.ts ./
COPY server/drizzle/ server/drizzle/

EXPOSE 3000

CMD ["bun", "run", "server/src/index.ts"]
