# ── Stage 1: build web ───────────────────────────────────────────────────────
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --prefer-offline
COPY web/ ./
RUN npm run build

# ── Stage 2: build server ────────────────────────────────────────────────────
FROM node:24-alpine AS server-build
WORKDIR /server
COPY server/package.json server/package-lock.json ./
RUN npm ci --prefer-offline
COPY server/ ./
RUN npm run build

# ── Stage 3: production image ─────────────────────────────────────────────────
FROM node:24-alpine
WORKDIR /app

# su-exec: drop privileges from root to `node` after entrypoint chowns /data.
# Lets bind-mounted host volumes with arbitrary ownership self-heal at boot.
RUN apk add --no-cache su-exec

# Production server deps only
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --prefer-offline

# Compiled server JS
COPY --from=server-build /server/dist ./dist

# Built web assets served by Hono serveStatic
COPY --from=web /web/dist ./web/dist

# Entrypoint runs as root, chowns /data, then su-exec's to `node`.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Persistent data lives in /data — mount as a Docker volume.
# Pre-create with the non-root `node` user owning it so writes succeed
# when no host volume is mounted (e.g. local `docker run` without -v).
RUN mkdir -p /data && chown -R node:node /data /app

# Persistent data lives in /data — mount as a Docker volume
ENV DATA_FILE=/data/database.yaml
ENV DATA_POINTS_FILE=/data/datapoints.csv
ENV LOGS_DIR=/data/logs
ENV WEB_DIST=/app/web/dist
ENV PORT=8080

VOLUME ["/data"]
EXPOSE 8080

# Container starts as root so the entrypoint can chown /data; the entrypoint
# then drops to `node` (uid 1000) via su-exec before running the app.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
