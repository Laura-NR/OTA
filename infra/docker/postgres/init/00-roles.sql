-- Read-only role for the Postgres MCP / inspection tooling.
-- Matches the connection string in opencode.jsonc.
CREATE ROLE ota_ro LOGIN PASSWORD 'ota_ro';
GRANT CONNECT ON DATABASE ota_dev TO ota_ro;
GRANT USAGE ON SCHEMA public TO ota_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ota_ro;
