# Single-container image: the Next.js app and its PostgreSQL database, started by tini.
# All state (database files and generated secrets) lives under /data - mount a volume there.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
 # Ops scripts (migrate, seed, ledger check) bundled into plain JavaScript: no TypeScript tooling at runtime.
 && npx esbuild scripts/migrate.ts scripts/seed.ts scripts/verify-ledger.ts \
      --bundle --platform=node --target=node24 --outdir=dist-ops --external:pg-native --log-level=warning

FROM node:24-alpine AS runtime
RUN apk add --no-cache postgresql16 postgresql16-client tini su-exec \
 && addgroup -S app && adduser -S app -G app \
 && install -d -m 755 /data
WORKDIR /app
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/dist-ops ./ops
COPY --from=build --chown=app:app /app/db/migrations ./db/migrations
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/lemans /usr/local/bin/lemans
VOLUME ["/data"]
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- http://127.0.0.1:3100/api/ready || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
