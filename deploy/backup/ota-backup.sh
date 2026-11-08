#!/bin/bash
# Encrypted off-site backups of the platform database and generated documents,
# and their restore (docs/deployment-plan.md D11, B11; runbook "Backups and
# restore"). Runs in the compose service `backup` (deploy/compose.prod.yml).
# The private key never stays on the server: a restore reads it from
# /run/age/identity, mounted for that run only. A backup streams the dump
# straight into age; a restore decrypts into a private temporary directory
# that is deleted when it exits.
set -euo pipefail
umask 077

IDENTITY=/run/age/identity
DOCUMENTS=/data/documents

die() {
  echo "ota-backup: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
Usage:
  backup [daily|pre-deploy]  dump, encrypt for AGE_RECIPIENTS, upload to BACKUP_REMOTE
  list                       the stored backups
  restore drill [<stamp>]    into the throwaway restore_drill_db (newest by default), then check it
  restore live <stamp>       over the platform database (needs CONFIRM_RESTORE=<database name>)
EOF
  exit 2
}

[ -n "${BACKUP_REMOTE:-}" ] || die 'set BACKUP_REMOTE (deploy/backup.env), e.g. offsite:ota-backups'
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

backup() {
  local kind=${1:-daily}
  case $kind in daily | pre-deploy) ;; *) usage ;; esac
  [ -n "${AGE_RECIPIENTS:-}" ] || die 'set AGE_RECIPIENTS (one or more age1... public keys)'
  # shellcheck disable=SC2086 # one recipient per word
  printf '%s\n' $AGE_RECIPIENTS >"$work/recipients"

  local stamp db docs
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  db="db-$stamp.dump.age"
  docs="documents-$stamp.tar.age"
  pg_dump --format=custom | age -R "$work/recipients" -o "$work/$db"
  tar -C "$DOCUMENTS" -cf - . | age -R "$work/recipients" -o "$work/$docs"

  rclone copyto "$work/$db" "$BACKUP_REMOTE/$kind/$db"
  rclone copyto "$work/$docs" "$BACKUP_REMOTE/$kind/$docs"
  echo "Uploaded $kind/$db ($(stat -c %s "$work/$db") bytes) and $kind/$docs ($(stat -c %s "$work/$docs") bytes)."

  # The month's first good daily backup is also its monthly one.
  if [ "$kind" = daily ] &&
    ! rclone lsf "$BACKUP_REMOTE/monthly/" --include "db-${stamp:0:6}*" 2>/dev/null | grep -q .; then
    rclone copyto "$BACKUP_REMOTE/daily/$db" "$BACKUP_REMOTE/monthly/$db"
    rclone copyto "$BACKUP_REMOTE/daily/$docs" "$BACKUP_REMOTE/monthly/$docs"
    echo "Kept as the monthly backup for ${stamp:0:6}."
  fi

  # Only after a good upload, so the newest backup always survives.
  rclone delete --min-age "${BACKUP_KEEP_DAILY:-30d}" "$BACKUP_REMOTE/daily" 2>/dev/null || true
  rclone delete --min-age "${BACKUP_KEEP_DAILY:-30d}" "$BACKUP_REMOTE/pre-deploy" 2>/dev/null || true
  rclone delete --min-age "${BACKUP_KEEP_MONTHLY:-186d}" "$BACKUP_REMOTE/monthly" 2>/dev/null || true
}

list() {
  rclone lsl "$BACKUP_REMOTE" --include '*.age' | sort -k4
}

# The stored path of db-<stamp>.dump.age; with no stamp, the newest one.
find_dump() {
  local want=${1:+db-$1.dump.age} found
  found=$(rclone lsf -R --files-only --include 'db-*.dump.age' "$BACKUP_REMOTE" |
    awk -F/ -v want="$want" 'want == "" || $NF == want { print $NF " " $0 }' |
    sort | tail -n 1 | cut -d' ' -f2)
  [ -n "$found" ] || die "no backup ${want:+named $want }in $BACKUP_REMOTE"
  echo "$found"
}

counts() {
  psql -X -At -v ON_ERROR_STOP=1 -d "$1" <<'SQL'
SELECT 'migrations ' || count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;
SELECT 'users ' || count(*) FROM users;
SELECT 'reservations ' || count(*) FROM reservations;
SELECT 'payment_receipts ' || count(*) FROM payment_receipts;
SELECT 'documents ' || count(*) FROM documents;
SELECT 'audit_logs ' || count(*) FROM audit_logs;
SELECT 'active_super_admins ' || count(*) FROM users WHERE role = 'SUPER_ADMIN' AND deactivated_at IS NULL;
SQL
}

restore() {
  local mode=${1:-} path stamp files
  [ -r "$IDENTITY" ] || die "mount the age private key at $IDENTITY for this run (-v <key file>:$IDENTITY:ro)"
  case $mode in
    drill) path=$(find_dump "${2:-}") ;;
    live)
      [ -n "${2:-}" ] || die 'name the backup to restore over the live database: restore live <stamp>'
      [ "${CONFIRM_RESTORE:-}" = "$PGDATABASE" ] ||
        die "this replaces the database $PGDATABASE; set CONFIRM_RESTORE=$PGDATABASE to go ahead"
      path=$(find_dump "$2")
      ;;
    *) usage ;;
  esac
  stamp=${path##*/db-}
  stamp=${stamp%.dump.age}
  echo "Restoring $path ($mode)."
  rclone copyto "$BACKUP_REMOTE/$path" "$work/db.dump.age"
  rclone copyto "$BACKUP_REMOTE/${path%/*}/documents-$stamp.tar.age" "$work/documents.tar.age"
  # Decrypt both before anything is dropped: a wrong key or a damaged file stops here.
  age -d -i "$IDENTITY" -o "$work/db.dump" "$work/db.dump.age"
  age -d -i "$IDENTITY" -o "$work/documents.tar" "$work/documents.tar.age"
  rm "$work/db.dump.age" "$work/documents.tar.age"

  local live_host=$PGHOST live_user=$PGUSER live_password=$PGPASSWORD
  if [ "$mode" = drill ]; then
    export PGHOST=restore_drill_db PGUSER=postgres PGPASSWORD=drill
  fi
  PGOPTIONS='-c client_min_messages=warning' psql -X -q -v ON_ERROR_STOP=1 -d postgres \
    -c "DROP DATABASE IF EXISTS \"$PGDATABASE\" WITH (FORCE)" \
    -c "CREATE DATABASE \"$PGDATABASE\""
  pg_restore --no-owner --no-privileges --exit-on-error -d "$PGDATABASE" "$work/db.dump"

  if [ "$mode" = live ]; then
    ota-runtime-role
    tar -C "$DOCUMENTS" -xf "$work/documents.tar"
    files=$(find "$DOCUMENTS" -type f | wc -l)
    echo "Documents restored into the volume ($files files there now)."
  else
    files=$(tar -tf "$work/documents.tar" | grep -vc '/$' || true)
    echo "Documents archive decrypts and lists: $files files."
  fi

  echo 'Restored counts:'
  counts "$PGDATABASE" | tee "$work/restored"
  if [ "$mode" = drill ]; then
    echo 'Live counts now (the live database has moved on since the dump):'
    PGHOST=$live_host PGUSER=$live_user PGPASSWORD=$live_password counts "$PGDATABASE" || true
  fi
  grep -q '^migrations [1-9]' "$work/restored" || die 'the restore has no applied migrations'
  grep -q '^users [1-9]' "$work/restored" || die 'the restore has no users'
  grep -q '^active_super_admins [1-9]' "$work/restored" ||
    echo 'WARNING: no active Super Admin in the restore: nobody could manage staff on the desk.' >&2
  if [ "$mode" = live ]; then
    echo 'Next: run the retention pass before starting the apps (runbook "Backups and restore").'
  fi
  echo "Restore $mode OK."
}

# Email a backup's result to BACKUP_MAIL_TO (D17: a failure must be loud),
# through the same SMTP settings the API uses; TLS as the API's mailer does it.
notify() {
  local status=$1 log=$2 subject url
  if [ -z "${BACKUP_MAIL_TO:-}" ] || [ -z "${SMTP_HOST:-}" ] || [ -z "${MAIL_FROM:-}" ]; then
    echo 'ota-backup: no BACKUP_MAIL_TO, SMTP_HOST or MAIL_FROM; the result is not emailed.' >&2
    return 0
  fi
  if [ "$status" -eq 0 ]; then subject='Backup OK'; else subject='Backup FAILED'; fi
  subject="$subject: ${BACKUP_REMOTE%%:*} $(date -u +%Y-%m-%dT%H:%MZ)"
  if [ "${SMTP_PORT:-587}" = 465 ]; then url="smtps://$SMTP_HOST:465"; else url="smtp://$SMTP_HOST:${SMTP_PORT:-587}"; fi
  {
    printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' \
      "$MAIL_FROM" "$BACKUP_MAIL_TO" "$subject"
    tail -n 40 "$log"
  } >"$work/mail"
  local from=${MAIL_FROM##*<}
  from=${from%>}
  # The password goes to curl on stdin, not in its arguments.
  if [ -n "${SMTP_USER:-}" ]; then
    printf 'user = "%s:%s"\n' "$SMTP_USER" "${SMTP_PASSWORD:-}"
  fi | curl --silent --show-error --ssl --config - --url "$url" \
    --mail-from "$from" --mail-rcpt "$BACKUP_MAIL_TO" --upload-file "$work/mail" ||
    echo 'ota-backup: the result could not be emailed.' >&2
}

case ${1:-} in
  backup)
    # A child process, so `set -e` still stops the backup at its first error.
    set +e
    "$0" _backup "${2:-}" 2>&1 | tee "$work/log"
    status=${PIPESTATUS[0]}
    set -e
    notify "$status" "$work/log"
    exit "$status"
    ;;
  _backup) backup "${2:-}" ;;
  list) list ;;
  restore) restore "${2:-}" "${3:-}" ;;
  *) usage ;;
esac
