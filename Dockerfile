# syntax=docker/dockerfile:1

# ── Stage 1 : build du client React/Vite ───────────────────────────────
FROM node:22-bookworm-slim AS client-build
WORKDIR /app
# npm workspaces : lock unique à la racine + package.json des trois workspaces
# requis pour que npm résolve correctement les dépendances hoistées.
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/
RUN npm ci
COPY shared/ ./shared/
RUN npm run build:shared
COPY client/ ./client/
# L'URL d'API est figée dans le bundle au build (Vite). En conteneur unifié
# (même origine) on la pointe vers le /api du domaine public.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# Bundle uniquement (vite/esbuild) : le type-check `tsc -b` est un gate CI/pré-commit,
# pas une étape de build prod — il ne doit pas bloquer l'image sur des types de tests
# (les fichiers de test ne sont pas embarqués dans le bundle).
WORKDIR /app/client
RUN npx vite build

# ── Stage 2 : compilation du serveur Express/TypeScript ───────────────────
FROM node:22-bookworm-slim AS server-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/
RUN npm ci
COPY shared/ ./shared/
RUN npm run build:shared
COPY server/ ./server/
# tsc compile src → dist ; les .sql ne sont pas compilés, on les copie à côté
# des runners compilés : migrations (migrate.js) + bootstrap (prepare-db.js).
WORKDIR /app/server
RUN npm run build \
  && cp -r src/migrations dist/migrations \
  && cp src/__tests__/bootstrap.sql dist/bootstrap.sql

# ── Stage 3 : node_modules de production (toolchain pour deps natives) ─────
FROM node:22-bookworm-slim AS server-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/
# npm workspaces hoiste les deps dans /app/node_modules.
RUN npm ci --omit=dev && npm cache clean --force

# ── Stage 4 : image runtime légère ────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
# Deps hoistées à la racine du workspace par npm workspaces.
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=server-build /app/shared/package.json ./shared/package.json
COPY --from=server-build /app/shared/dist ./shared/dist
WORKDIR /app/server
COPY server/package.json ./
COPY --from=server-build /app/server/dist ./dist
# SPA buildé servi par Express en prod (app.ts → ../public)
COPY --from=client-build /app/client/dist ./public
EXPOSE 3000
# Bootstrap + migrations au démarrage (idempotent), puis serveur.
# Pas de dépendance à une commande pre-deploy d'orchestrateur.
CMD ["sh", "-c", "node dist/prepare-db.js && node dist/index.js"]
