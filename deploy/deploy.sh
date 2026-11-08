#!/usr/bin/env bash
# Deploys a release on the server (docs/deployment-plan.md D15, B3; runbook
# "Deploy a release" and "Roll back"), from the repository checkout at that
# release's tag, so the compose file and Caddy settings match its images:
#   git fetch --tags && git checkout <tag> && deploy/deploy.sh <tag>
#   git checkout <previous tag> && deploy/deploy.sh --rollback <previous tag>
# A deploy pulls the tag's images, takes the pre-deploy dump (deploy/backup.env),
# runs the migrations as the schema owner, starts the stack and waits until it
# is healthy, then records the tag as OTA_VERSION in deploy/.env, so later
# compose commands (backups, one-off commands) run the same release. A rollback
# skips the dump and the migrations: migrations are forward-only.
# Rehearsal: COMPOSE='docker compose -f deploy/compose.prod.yml -f deploy/compose.rehearsal.yml'.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=${COMPOSE:-docker compose -f deploy/compose.prod.yml}
ENV_FILE=deploy/.env

die() {
  echo "deploy: $*" >&2
  exit 1
}

usage() {
  echo 'Usage: deploy/deploy.sh [--rollback] <tag>' >&2
  exit 2
}

rollback=
if [ "${1:-}" = --rollback ]; then
  rollback=1
  shift
fi
[ $# -eq 1 ] || usage
tag=$1
[[ $tag =~ ^v[0-9A-Za-z_.-]+$ ]] || die "not a release tag: $tag (vX.Y.Z)"

git tag --points-at HEAD | grep -qxF "$tag" ||
  die "the checkout is not at $tag: git fetch --tags && git checkout $tag"
git diff --quiet HEAD -- ||
  die 'the checkout has local changes to tracked files; settings belong in the gitignored deploy/*.env'
[ -f "$ENV_FILE" ] || die "no $ENV_FILE (copy deploy/.env.production.example)"
grep -qE '^OTA_IMAGE_PREFIX=.+' "$ENV_FILE" ||
  die "set OTA_IMAGE_PREFIX in $ENV_FILE (ghcr.io/<owner>/ota), or every pull goes to Docker Hub"

previous=$(sed -n 's/^OTA_VERSION=//p' "$ENV_FILE" | tail -1)
# The shell's value wins over deploy/.env for every compose command below.
export OTA_VERSION=$tag
images=(api storefront desk backup)

echo "Pulling $tag"
$COMPOSE pull --policy missing "${images[@]}" ||
  die "pulling $tag failed (is it pushed, and is this server logged in to the registry?); nothing was changed"

if [ -z "$rollback" ]; then
  echo 'Taking the pre-deploy dump'
  $COMPOSE run --rm backup backup pre-deploy ||
    die 'the pre-deploy dump failed (deploy/backup.env); nothing was changed'
  echo 'Migrating'
  $COMPOSE run --rm migrate ||
    die "the migration failed; the stack still runs ${previous:-the previous release}. If the data is damaged, restore the pre-deploy dump (runbook \"Roll back\")"
fi

echo "Starting $tag"
$COMPOSE up -d --wait --wait-timeout 300 ||
  die "the stack did not become healthy on $tag ($COMPOSE ps). Roll back: git checkout ${previous:-<previous tag>} && deploy/deploy.sh --rollback ${previous:-<previous tag>}"

if grep -q '^OTA_VERSION=' "$ENV_FILE"; then
  sed -i "s/^OTA_VERSION=.*/OTA_VERSION=$tag/" "$ENV_FILE"
else
  [ -z "$(tail -c1 "$ENV_FILE")" ] || echo >>"$ENV_FILE"
  printf 'OTA_VERSION=%s\n' "$tag" >>"$ENV_FILE"
fi

echo "Deployed $tag (was ${previous:-local}). Next: deploy/smoke.sh, then sign in on both sites."
[ -z "$previous" ] ||
  echo "To roll back: git checkout $previous && deploy/deploy.sh --rollback $previous"
