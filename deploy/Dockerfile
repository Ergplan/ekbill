# EkBill v2: one image, two commands (the web server and the worker).
#
#   docker compose -p ekbill2 -f deploy/docker-compose.yml up -d --build
#
# The build stage installs the workspaces and builds the Next.js app; the
# runtime stage carries the standalone server, the worker's sources with the
# production node_modules (tsx runs them), Chromium with fonts that have the
# rupee sign and Devanagari, and the migration runner. The app container
# applies pending migrations before it serves.

FROM node:22-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY design/package.json design/
COPY packages/ai/package.json packages/ai/
COPY packages/copy/package.json packages/copy/
COPY packages/db/package.json packages/db/
COPY packages/engine/package.json packages/engine/
COPY packages/render/package.json packages/render/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-dejavu-core ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# The web server (standalone output keeps the workspace layout: apps/web/server.js).
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
# The worker and the migration runner share the sources and the full node_modules.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json /app/tsconfig.base.json ./
COPY --from=build /app/design ./design
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/worker ./apps/worker
RUN mkdir -p /app/state && useradd -r -u 10001 -m app && chown -R app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
# compose overrides this for the worker: node_modules/.bin/tsx apps/worker/src/index.ts
CMD ["sh", "-c", "node packages/db/migrate.mjs && exec node apps/web/server.js"]
