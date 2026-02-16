# Build stage
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# Copy migration SQL files to where the bundled migrator expects them
# tsup bundles everything into dist/index.js, so import.meta.url resolves to dist/
# and the migrator looks for migrations/ relative to that (__dirname + '/migrations')
RUN mkdir -p dist/migrations && \
    cp src/db/migrations/*.sql dist/migrations/

# Prune dev dependencies for production
RUN npm prune --omit=dev --legacy-peer-deps

# Production stage
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["node", "dist/index.js"]
