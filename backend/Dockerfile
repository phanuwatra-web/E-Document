# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────
# DocSign Backend — multi-stage production image
# ─────────────────────────────────────────────────────────────────────
# Stage 1: install production dependencies (build tools live HERE only)
# Stage 2: lean runtime — copies only the artefacts it needs
#
# Final image: ~150 MB (node:20-alpine ~50 MB + node_modules ~100 MB)
# ─────────────────────────────────────────────────────────────────────

# ===== Stage 1: deps =====================================================
FROM node:20-alpine AS deps
WORKDIR /app

# bcrypt has a native module. Alpine prebuilds usually exist, but we keep
# build tools available so any node_modules with a postinstall hook can
# compile from source. These tools are NOT copied into the runtime image.
RUN apk add --no-cache python3 make g++

# Layer cache: copy lockfile first so deps reinstall only when it changes.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# ===== Stage 2: runtime ===================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000 \
    NPM_CONFIG_LOGLEVEL=warn

# tini  → reaps zombie children and forwards SIGTERM correctly so the Node
#         process can run its graceful-shutdown handlers from server.js.
# wget  → used by the HEALTHCHECK below (curl is not in alpine by default).
RUN apk add --no-cache tini wget && \
    addgroup -S app && adduser -S app -G app && \
    mkdir -p /app/uploads && chown -R app:app /app

# Pull only the production node_modules built in stage 1 — none of the
# python/make/g++ baggage from that stage leaks here.
COPY --from=deps --chown=app:app /app/node_modules ./node_modules

# Source code last (changes most often → cache-friendly).
COPY --chown=app:app . .

USER app
EXPOSE 5000

# Container-level healthcheck consumes the same /readiness endpoint we
# expose to Kubernetes. 503 = unhealthy → orchestrator restarts the pod
# OR depools the container depending on layer (compose: restarts).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider --tries=1 http://localhost:5000/readiness || exit 1

# tini as PID 1 — ensures SIGTERM from `docker stop` reaches Node so
# server.js can drain in-flight requests instead of being killed mid-write.
ENTRYPOINT ["/sbin/tini", "--"]

# Migrations are idempotent (CREATE TABLE IF NOT EXISTS …) so running them
# on every boot is safe. Keeps the deployment one-step.
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
