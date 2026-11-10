# ==============================================================================
# CONQUIZ V9.0 – MULTI-STAGE PRODUCTION DOCKERFILE
# ==============================================================================

# Stage 1: Build Frontend & Verify TypeScript
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* bun.lock* ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install wget/curl for healthcheck and postgresql-client for optional administrative scripts
RUN apk add --no-cache wget ca-certificates

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps && npm install tsx --legacy-peer-deps && npm cache clean --force

# Copy built frontend and server source/data
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/src/game ./src/game
COPY --from=builder /app/src/data ./src/data
COPY --from=builder /app/db ./db
COPY --from=builder /app/data ./data
COPY --from=builder /app/scripts ./scripts

# Ensure data directory is writable by non-root user 'node'
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/healthz || exit 1

CMD ["npx", "tsx", "server.ts"]
