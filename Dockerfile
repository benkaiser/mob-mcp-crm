# Build stage
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Copy migration SQL files to where the bundled migrator expects them
# (migrator uses __dirname which resolves to dist/db/ at runtime)
RUN mkdir -p dist/db/migrations && \
    cp src/db/migrations/*.sql dist/db/migrations/

# Prune dev dependencies for production
RUN npm prune --omit=dev

# Production stage
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["node", "dist/index.js"]
