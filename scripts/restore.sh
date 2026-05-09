#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# DocSign restore — INVERSE of backup.sh
#
# Usage:
#   ./scripts/restore.sh <timestamp>
#   ./scripts/restore.sh 2026-05-08_03-30-00
#
# Requires the matching pair of files to exist in $BACKUP_DIR:
#   docsign_<ts>.dump
#   uploads_<ts>.tar.gz
#
# ⚠  DESTRUCTIVE — this drops the existing schema (--clean --if-exists)
#    and wipes the uploads folder before extracting.
#
# Recommended pre-flight:
#   1. Tell users the system will be down for ~5 min
#   2. ./scripts/backup.sh           ← snapshot current state first
#   3. docker compose stop backend   ← stop writes
#   4. ./scripts/restore.sh <ts>
#   5. docker compose start backend
#   6. Verify via /readiness + a manual login
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
PG_USER="${POSTGRES_USER:-docsign}"
PG_DB="${POSTGRES_DB:-docsign}"

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <timestamp>"
  echo
  echo "Available backups in $BACKUP_DIR:"
  ls -1 "$BACKUP_DIR"/docsign_*.dump 2>/dev/null \
    | sed -E 's|.*docsign_(.*)\.dump$|  \1|' \
    || echo "  (none — run scripts/backup.sh first)"
  exit 1
fi

ts="$1"
db_in="$BACKUP_DIR/docsign_${ts}.dump"
files_in="$BACKUP_DIR/uploads_${ts}.tar.gz"

[ -f "$db_in" ]    || { echo "[restore] missing $db_in";    exit 1; }
[ -f "$files_in" ] || { echo "[restore] missing $files_in"; exit 1; }

cat <<EOF

⚠  RESTORE WILL OVERWRITE LIVE DATA
   DB      : $db_in   ($(du -h "$db_in"    | cut -f1))
   uploads : $files_in   ($(du -h "$files_in" | cut -f1))

   The existing database tables and uploads/* will be wiped.
   Type 'YES' (uppercase) to proceed.
EOF
read -r -p "> " confirm
[ "$confirm" = "YES" ] || { echo "aborted"; exit 1; }

log() { echo "[restore $(date +%H:%M:%S)] $*"; }

# ── 1. Database  ──────────────────────────────────────────────────────
log "restoring DB"
docker compose exec -T postgres \
  pg_restore -U "$PG_USER" -d "$PG_DB" \
             --clean --if-exists --no-owner --no-acl \
  < "$db_in"

# ── 2. Uploads  ───────────────────────────────────────────────────────
log "restoring uploads"
docker compose exec -T backend \
  sh -c 'rm -rf /app/uploads/* /app/uploads/.[!.]* 2>/dev/null; tar -C /app/uploads -xzf -' \
  < "$files_in"

log "done — verify with: curl -fsS http://localhost:5000/readiness"
