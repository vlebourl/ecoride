# EcoRide

PWA mobile-first de suivi de trajets vélo avec calcul d'économies CO₂, argent et essence.

## Stack

- **Frontend** : React 19 + Vite + TailwindCSS v4 + PWA
- **Backend** : Bun + Hono
- **Auth** : Better Auth + Google OAuth
- **DB** : PostgreSQL + Drizzle ORM
- **Deploy** : Coolify → `velo.tiarkaerell.com`

## Setup

```bash
# Prérequis : Bun, Docker

# 1. Installer les dépendances
bun install

# 2. Copier les variables d'environnement
cp .env.example .env
# → Remplir GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BETTER_AUTH_SECRET

# 3. Lancer PostgreSQL
docker compose up -d

# 4. Pousser le schéma DB
bun run db:push

# 5. Lancer le dev
bun run dev
```

Le client tourne sur http://localhost:5173, le serveur sur http://localhost:3000.

## Structure

```
shared/     Types TypeScript partagés + contrats API
server/     API Hono + Drizzle schema + Better Auth
client/     React PWA + Tailwind
```

## Scripts

| Commande | Description |
|----------|-------------|
| `bun run dev` | Lance client + serveur en parallèle |
| `bun run dev:client` | Client seul (Vite :5173) |
| `bun run dev:server` | Serveur seul (Hono :3000) |
| `bun run db:push` | Applique le schéma Drizzle sur la DB |
| `bun run db:generate` | Génère une migration Drizzle |
| `bun run db:studio` | Ouvre Drizzle Studio |
| `bun run typecheck` | Vérifie les types dans tous les workspaces |

## Deploiement

### Production (Coolify)

L'application est deployee automatiquement sur `velo.tiarkaerell.com` via Coolify a chaque push sur `main`.

Secrets GitHub requis :
- `COOLIFY_TOKEN` — Token API Coolify
- `COOLIFY_APP_UUID` — UUID de l'application dans Coolify

### Docker local

```bash
# Build et lancer tous les services
docker compose up --build

# L'app est accessible sur http://localhost:3000
```

### Variables d'environnement (production)

Configurer dans Coolify → onglet **Environment** :

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Connexion PostgreSQL |
| `BETTER_AUTH_SECRET` | Secret auth (`openssl rand -hex 32`) |
| `BETTER_AUTH_URL` | `https://velo.tiarkaerell.com` |
| `GOOGLE_CLIENT_ID` | Client ID Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Client Secret Google OAuth |
| `FRONTEND_URL` | `https://velo.tiarkaerell.com` |
| `VAPID_PUBLIC_KEY` | Cle publique push (`bunx web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY` | Cle privee push |
| `VAPID_SUBJECT` | `mailto:contact@tiarkaerell.com` |
