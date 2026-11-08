# Backups and restores (docs/deployment-plan.md D11, B11): pg_dump and
# pg_restore from the database's own image, age to encrypt, rclone to upload
# off-site, curl to email the result (D17). Build from the repository root:
#   docker build -f deploy/docker/backup.Dockerfile -t ota/backup .
# Runs as the compose service `backup` (deploy/compose.prod.yml).

FROM postgres:16.15-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends age rclone curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY deploy/backup/ota-backup.sh /usr/local/bin/ota-backup
# A live restore re-creates the API's role grants with the init script (B4).
COPY deploy/postgres/init/10-runtime-role.sh /usr/local/bin/ota-runtime-role
# The API image's user, so restored documents stay writable by the API.
USER 1000:1000
# The off-site remote is defined by RCLONE_CONFIG_* variables, not a file.
ENV HOME=/tmp \
  RCLONE_CONFIG=/dev/null
ENTRYPOINT ["ota-backup"]
