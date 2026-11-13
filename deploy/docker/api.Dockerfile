# The API image: NestJS, the BullMQ workers, and Chromium for PDFs.
# Build from the repository root:
#   docker build -f deploy/docker/api.Dockerfile -t ota/api .
# The same image runs the migrations (deploy/compose.prod.yml, service `migrate`).
#
# No BuildKit-only syntax (cache mounts), so the classic builder works too.

FROM node:22.22.3-bookworm-slim AS base
# Prisma's engines need OpenSSL, which the slim image lacks.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  CI=1 \
  PNPM_HOME=/pnpm \
  PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Everything, built: the API and the workspace packages it uses.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm exec turbo run build --filter=@ota/api... --env-mode=loose \
  && tar -cf /tmp/dist.tar apps/api/dist packages/*/dist

# Production dependencies only, for the API and its workspace packages, and the
# Prisma client generated for this platform.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --prod
COPY . .
RUN pnpm --filter "@ota/api..." install --prod --offline --frozen-lockfile \
  && pnpm --filter @ota/db exec prisma generate

FROM base AS runtime
ENV NODE_ENV=production \
  PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  DOCUMENTS_DIR=/data/documents \
  PORT=3001
COPY --from=deps /app /app
COPY --from=build /tmp/dist.tar /tmp/dist.tar
# Chromium's headless shell and its system libraries, from the repo's own
# Playwright (the version packages/documents launches).
RUN tar -xf /tmp/dist.tar && rm /tmp/dist.tar \
  && cd packages/documents \
  && node_modules/.bin/playwright install --with-deps --only-shell chromium \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/documents \
  && chown node:node /data/documents
USER node
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
