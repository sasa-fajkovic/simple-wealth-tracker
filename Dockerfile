# ── Stage 1: build web ───────────────────────────────────────────────────────
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --prefer-offline
COPY web/ ./
RUN npm run build

# ── Stage 2: build server ────────────────────────────────────────────────────
FROM node:20-alpine AS server-build
WORKDIR /server
COPY server/package.json server/package-lock.json ./
RUN npm ci --prefer-offline
COPY server/ ./
RUN npm run build

# ── Stage 3: production image ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Production server deps only
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --prefer-offline

# Compiled server JS
COPY --from=server-build /server/dist ./dist

# Built web assets served by Hono serveStatic
COPY --from=web /web/dist ./web/dist

# Persistent data lives in /data — mount as a Docker volume
ENV DATA_FILE=/data/database.yaml
ENV DATA_POINTS_FILE=/data/datapoints.csv
ENV LOGS_DIR=/data/logs
ENV WEB_DIST=/app/web/dist
ENV PORT=8080

VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "dist/index.js"]
