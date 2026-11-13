#!/bin/sh
# The API's least-privilege role (docs/deployment-plan.md D10, B4): read and
# write data, no DDL. POSTGRES_USER owns the schema and runs the migrations
# (compose service `migrate`); the default privileges below extend the grants to
# every table a later migration creates.
# Postgres runs this once, on an empty volume. On an existing database, re-run it:
#   docker compose -f deploy/compose.prod.yml exec postgres /docker-entrypoint-initdb.d/10-runtime-role.sh
set -eu
: "${POSTGRES_APP_USER:?set POSTGRES_APP_USER}"
: "${POSTGRES_APP_PASSWORD:?set POSTGRES_APP_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$POSTGRES_APP_USER" \
  -v app_password="$POSTGRES_APP_PASSWORD" \
  -v owner="$POSTGRES_USER" \
  -v db="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I', :'app_user')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user')\gexec
ALTER ROLE :"app_user" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';

REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_user";

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
SQL
