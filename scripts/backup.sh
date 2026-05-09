#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# DocSign backup
#
# Snapshots both the PostgreSQL database AND the signed-PDF uploads
# volume into a single timestamped pair of files, then prunes anything
# older than RETENTION_DAYS.
#
# Designed to run on the docker-compose host (cron / systemd-timer).
# Both backup steps go via `docker compose exec`, so it works whether
# postgres' port is exposed to the host or not.
#
# ENV
#   BACKUP_DIR       Where the dumps land (default: ./backups)
#   RETENTION_DAYS   Older files deleted (default: 30)
#   POSTGRES_USER    Defaults to docsign — match docker-compose.yml
#   POSTGRES_DB      Defaults to docsign
#
# Cron example (server-local crontab, daily at 03:30):
#   30 3 * * *   cd /opt/docsign && ./scripts/backup.sh \
#                  >> /var/log/docsign-backup.log 2>&1
#
# Always test RESTORE at least once after enabling — a backup that
# can't be restored is not a backup.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
PG_USER="${POSTGRES_USER:-docsign}"
PG_DB="${POSTGRES_DB:-docsign}"

mkdir -p "$BACKUP_DIR"

ts=$(date +%Y-%m-%d_%H-%M-%S)
db_out="$BACKUP_DIR/docsign_${ts}.dump"
files_out="$BACKUP_DIR/uploads_${ts}.tar.gz"

log() { echo "[backup $(date +%H:%M:%S)] $*"; }

# ── 1. Database  ──────────────────────────────────────────────────────
# pg_dump --format=custom is already compressed AND lets pg_restore
# do parallel restore + selective table restore later if needed.
# --no-owner / --no-acl makes the dump portable across roles.
log "DB → $db_out"
docker compose exec -T postgres \
  pg_dump -U "$PG_USER" -d "$PG_DB" \
          --format=custom --no-owner --no-acl \
  > "$db_out.tmp"
mv "$db_out.tmp" "$db_out"

# ── 2. Uploads volume  ────────────────────────────────────────────────
# tar -C /app/uploads is run inside the backend container so we don't
# need to know where Docker mounts the named volume on the host.
log "uploads → $files_out"
docker compose exec -T backend \
  tar -C /app/uploads -czf - . \
  > "$files_out.tmp"
mv "$files_out.tmp" "$files_out"

# ── 3. Retention prune  ───────────────────────────────────────────────
log "pruning files older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -name 'docsign_*.dump'     -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'uploads_*.tar.gz'   -mtime "+$RETENTION_DAYS" -delete

# ── 4. Summary  ───────────────────────────────────────────────────────
db_size=$(du -h "$db_out" | cut -f1)
files_size=$(du -h "$files_out" | cut -f1)
log "done — DB ${db_size} · uploads ${files_size}"
