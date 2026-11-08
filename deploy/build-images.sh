#!/usr/bin/env bash
# Builds the release images (docs/deployment-plan.md D15, B3) as
# $OTA_IMAGE_PREFIX/<image>:<tag>, the names deploy/compose.prod.yml runs.
# CI runs it on a tag (.github/workflows/release.yml, one image per job, PUSH=1);
# a rehearsal runs it here without pushing. From the repository root:
#   OTA_IMAGE_PREFIX=ghcr.io/<owner>/ota DESK_DOMAIN=desk.<domain> deploy/build-images.sh <tag> [<image>...]
# Images: api, storefront, desk, backup (all four by default). The desk needs
# DESK_DOMAIN: Next fixes its live-socket origin when it builds.
set -euo pipefail

die() {
  echo "build-images: $*" >&2
  exit 1
}

[ $# -ge 1 ] || {
  echo 'Usage: deploy/build-images.sh <tag> [api|storefront|desk|backup ...]' >&2
  exit 2
}
tag=$1
shift
[[ $tag =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || die "not a valid image tag: $tag"
: "${OTA_IMAGE_PREFIX:?set OTA_IMAGE_PREFIX, e.g. ghcr.io/<owner>/ota}"
[ $# -gt 0 ] || set -- api storefront desk backup

# A source link lets the registry tie each package to the repository.
labels=(--label "org.opencontainers.image.version=$tag")
[ -n "${OTA_SOURCE_URL:-}" ] && labels+=(--label "org.opencontainers.image.source=$OTA_SOURCE_URL")

for image in "$@"; do
  case $image in
    api) args=(-f deploy/docker/api.Dockerfile) ;;
    storefront) args=(-f deploy/docker/web.Dockerfile --build-arg APP=storefront --build-arg PORT=3000) ;;
    desk)
      [ -n "${DESK_DOMAIN:-}" ] || die 'set DESK_DOMAIN (desk.<domain>) to build the desk'
      args=(-f deploy/docker/web.Dockerfile --build-arg APP=backoffice --build-arg PORT=3002
        --build-arg "NEXT_PUBLIC_API_ORIGIN=https://$DESK_DOMAIN")
      ;;
    backup) args=(-f deploy/docker/backup.Dockerfile) ;;
    *) die "unknown image: $image (api, storefront, desk or backup)" ;;
  esac
  name=$OTA_IMAGE_PREFIX/$image:$tag
  echo "Building $name"
  docker build "${args[@]}" "${labels[@]}" -t "$name" .
  if [ -n "${PUSH:-}" ]; then
    docker push "$name"
  fi
done
