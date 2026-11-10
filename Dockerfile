# ==============================================================================
# CONQUIZ V9.1 – MULTI-STAGE PRODUCTION DOCKERFILE (BUN + BUN.LOCK)
# ==============================================================================

# Stage 1: Install dependencies & build frontend
FROM oven/bun:1.4.0 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN for attempt in 1 2 3; do \
      bun install --frozen-lockfile && break; \
      status=$?; \
      if [ "$attempt" -eq 3 ]; then exit "$status"; fi; \
      echo "Dependency install failed; retrying ($attempt/3)"; \
      sleep 5; \
    done

COPY . .
RUN bun run build

# Stage 2: Production Runtime
FROM oven/bun:1.4.0 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Reuse the dependency tree resolved in the builder. This avoids a second
# registry install during the production image build.
COPY --from=builder /app/node_modules ./node_modules
COPY package.json bun.lock ./

# Copy only required production artifacts (zero secrets or .env files)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/src/game ./src/game
COPY --from=builder /app/db ./db
COPY --from=builder /app/data/questions ./data/questions
COPY --from=builder /app/data/conquiz_db.example.json ./data/conquiz_db.example.json
COPY --from=builder /app/scripts ./scripts

# The named data volume is initialized from this directory by Docker.
# Leave dependencies and application code readable without recursive chown.
RUN mkdir -p /app/data && chown bun:bun /app/data

USER bun

EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["bun", "run", "server.ts"]
