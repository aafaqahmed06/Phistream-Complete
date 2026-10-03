# syntax=docker/dockerfile:1

ARG NODE_VERSION=24

# ---- base -------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app

# ---- deps: all dependencies (for compiling) -----------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ---- build: compile TypeScript --------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps: runtime dependencies only ----------------------------------------
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- runtime ----------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Application files stay root-owned (read-only for the runtime user).
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

# Run node directly (not via npm) so SIGTERM reaches the app for graceful shutdown.
CMD ["node", "dist/server.js"]
