# The two Next.js images: the storefront and the desk (back-office).
# Build from the repository root, naming the app:
#   docker build -f deploy/docker/web.Dockerfile --build-arg APP=storefront -t ota/storefront .
#   docker build -f deploy/docker/web.Dockerfile --build-arg APP=backoffice \
#     --build-arg NEXT_PUBLIC_API_ORIGIN=https://desk.<domain> -t ota/desk .
# The rewrites to the API and NEXT_PUBLIC_* are fixed when Next builds, so
# API_URL and NEXT_PUBLIC_API_ORIGIN are build arguments; pass API_URL again at
# run time for the server-side calls.
#
# No BuildKit-only syntax (cache mounts), so the classic builder works too.

FROM node:22.22.3-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  CI=1 \
  NEXT_TELEMETRY_DISABLED=1 \
  PNPM_HOME=/pnpm \
  PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
ARG APP
ARG API_URL=http://api:3001
ARG NEXT_PUBLIC_API_ORIGIN
ENV API_URL=$API_URL \
  NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
# Loose env mode: turbo would otherwise drop API_URL from Next's build.
RUN test -n "$APP" \
  && pnpm exec turbo run build --filter=@ota/$APP... --env-mode=loose \
  && rm -rf apps/$APP/.next/cache \
  && tar -cf /tmp/dist.tar apps/$APP/.next packages/*/dist

# Production dependencies only, for the app and its workspace packages.
FROM base AS deps
ARG APP
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --prod
COPY . .
RUN pnpm --filter "@ota/$APP..." install --prod --offline --frozen-lockfile

FROM base AS runtime
ARG APP
ARG PORT=3000
ENV NODE_ENV=production \
  PORT=$PORT
COPY --from=deps /app /app
COPY --from=build /tmp/dist.tar /tmp/dist.tar
# next start writes its cache under .next at run time.
RUN tar -xf /tmp/dist.tar && rm /tmp/dist.tar \
  && chown -R node:node apps/$APP/.next
USER node
WORKDIR /app/apps/$APP
EXPOSE $PORT
CMD ["sh", "-c", "exec node_modules/.bin/next start -p \"$PORT\""]
