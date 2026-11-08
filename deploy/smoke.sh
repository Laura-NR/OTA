#!/usr/bin/env bash
# Deploy smoke test (docs/deployment-plan.md B10). Run on the server after
# `up -d`, from the repository checkout:
#   SITE_DOMAIN=<domain> DESK_DOMAIN=desk.<domain> deploy/smoke.sh
# During the trial, also TRIAL_AUTH=<user>:<password> (the basic-auth gate).
# Rehearsal: add CURL_INSECURE=1 (Caddy's local CA), MAILPIT_URL=http://localhost:8025
# and COMPOSE='docker compose -f deploy/compose.prod.yml -f deploy/compose.rehearsal.yml'.
# Without MAILPIT_URL the sign-in links go to SMOKE_EMAIL's inbox: check that the
# storefront's starts with https://<domain>/ and the desk's with https://desk.<domain>/.
set -euo pipefail

: "${SITE_DOMAIN:?set SITE_DOMAIN}"
: "${DESK_DOMAIN:?set DESK_DOMAIN}"
COMPOSE=${COMPOSE:-docker compose -f deploy/compose.prod.yml}
SMOKE_EMAIL=${SMOKE_EMAIL:-smoke+$(date +%s)@example.test}

curl_opts=(-s -m 60)
[ -n "${CURL_INSECURE:-}" ] && curl_opts+=(-k)
auth_opts=()
[ -n "${TRIAL_AUTH:-}" ] && auth_opts=(-u "$TRIAL_AUTH")

failures=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }

# expect <description> <status> <curl args...>
expect() {
  local what=$1 want=$2 got
  shift 2
  got=$(curl "${curl_opts[@]}" -o /dev/null -w '%{http_code}' "$@" || true)
  if [ "$got" = "$want" ]; then pass "$what ($got)"; else fail "$what: got $got, want $want"; fi
}

# header <description> <url> <header regex>
header() {
  if curl "${curl_opts[@]}" "${auth_opts[@]}" -o /dev/null -D - "$2" | tr -d '\r' | grep -qiE "$3"; then
    pass "$1"
  else
    fail "$1"
  fi
}

site=https://$SITE_DOMAIN
desk=https://$DESK_DOMAIN

expect 'storefront home' 200 "${auth_opts[@]}" "$site/"
expect 'desk sign-in page' 200 "${auth_opts[@]}" "$desk/login"
expect 'API readiness through the storefront' 200 "${auth_opts[@]}" "$site/api/ota/health/ready"
expect 'an unknown path is a 404' 404 "${auth_opts[@]}" "$site/no-such-page-$RANDOM"
expect 'http redirects to https' 308 "http://$SITE_DOMAIN/"
if [ -n "${TRIAL_AUTH:-}" ]; then
  expect 'the trial gate asks strangers to sign in' 401 "$site/"
  header 'the trial gate asks crawlers to keep out' "$site/" '^x-robots-tag: noindex'
fi

header 'HSTS on the storefront' "$site/" '^strict-transport-security: max-age='
header 'nosniff on the storefront' "$site/" '^x-content-type-options: nosniff'
header 'the storefront refuses frames' "$site/" '^x-frame-options: DENY'
header 'the desk frames only itself' "$desk/login" '^x-frame-options: SAMEORIGIN'

# Each site signs in on its own host (D7a).
for host in "$SITE_DOMAIN" "$DESK_DOMAIN"; do
  email=${SMOKE_EMAIL/@/-${host%%.*}@}
  expect "sign-in link requested on $host" 200 "${auth_opts[@]}" \
    -H "Origin: https://$host" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"callbackURL\":\"/\"}" \
    "https://$host/api/auth/sign-in/magic-link"
  if [ -n "${MAILPIT_URL:-}" ]; then
    sleep 2
    id=$(curl -s "$MAILPIT_URL/api/v1/search?query=to:$email" | grep -o '"ID":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$id" ] && curl -s "$MAILPIT_URL/api/v1/message/$id" | grep -q "https://$host/api/auth/magic-link/verify"; then
      pass "the sign-in link for $host points at $host"
    else
      fail "the sign-in link for $host does not point at $host"
    fi
  fi
done

# The desk's live socket goes through the desk's host, for trusted origins only (D8a, B7).
expect 'socket handshake from the desk' 200 "${auth_opts[@]}" -H "Origin: $desk" \
  "$desk/socket.io/?EIO=4&transport=polling"
expect 'socket handshake from another origin is refused' 403 "${auth_opts[@]}" \
  -H 'Origin: https://smoke.invalid' "$desk/socket.io/?EIO=4&transport=polling"

# The API sees the caller's address, not one a client made up (F4, D8).
marker=smoke$RANDOM$RANDOM
curl "${curl_opts[@]}" "${auth_opts[@]}" -o /dev/null -H 'X-Forwarded-For: 203.0.113.99' \
  "$site/api/ota/tenant/config?$marker" || true
sleep 1
forwarded=$($COMPOSE logs --no-color --since 2m api 2>/dev/null | grep "$marker" | grep -o '"x-forwarded-for":"[^"]*"' | tail -1 || true)
if [ -z "$forwarded" ]; then
  fail 'forwarded address: the request did not reach the API log'
elif [[ $forwarded == *203.0.113.99* ]]; then
  fail "forwarded address: the API trusted a client's own header ($forwarded)"
else
  pass "forwarded address set by the edge ($forwarded)"
fi

if [ "$failures" -gt 0 ]; then
  printf '%d check(s) failed\n' "$failures"
  exit 1
fi
echo 'all checks passed'
