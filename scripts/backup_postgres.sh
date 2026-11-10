#!/usr/bin/env bash
# ==============================================================================
# CONQUIZ V9.0 – SCRIPT AUTOMAT DE BACKUP POSTGRESQL + JSON SNAPSHOT
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
PG_CONTAINER="${PG_CONTAINER:-conquiz-postgres}"
POSTGRES_USER="${POSTGRES_USER:-conquiz_user}"
POSTGRES_DB="${POSTGRES_DB:-conquiz}"

mkdir -p "${BACKUP_DIR}"

PG_BACKUP_FILE="${BACKUP_DIR}/conquiz_pg_${TIMESTAMP}.sql.gz"
JSON_BACKUP_FILE="${BACKUP_DIR}/conquiz_json_${TIMESTAMP}.json.gz"

echo "[BACKUP] Începere backup PostgreSQL din containerul '${PG_CONTAINER}'..."
if docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
  docker exec -t "${PG_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists | gzip -9 > "${PG_BACKUP_FILE}"
  echo "[BACKUP] Backup PostgreSQL salvat cu succes: ${PG_BACKUP_FILE} ($(du -h "${PG_BACKUP_FILE}" | cut -f1))"
elif [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "${DATABASE_URL}" --clean --if-exists | gzip -9 > "${PG_BACKUP_FILE}"
  echo "[BACKUP] Backup PostgreSQL (direct DATABASE_URL) salvat: ${PG_BACKUP_FILE}"
else
  echo "[AVERTISMENT] Nici containerul ${PG_CONTAINER} nu rulează, nici DATABASE_URL nu este setat."
fi

if [ -f "./data/conquiz_db.json" ]; then
  gzip -c "./data/conquiz_db.json" > "${JSON_BACKUP_FILE}"
  echo "[BACKUP] Snapshot JSON salvat: ${JSON_BACKUP_FILE}"
fi

echo "[BACKUP] Curățare backup-uri mai vechi de ${RETENTION_DAYS} zile..."
find "${BACKUP_DIR}" -type f -name "conquiz_*.gz" -mtime +"${RETENTION_DAYS}" -delete

echo "[BACKUP] Operațiune finalizată cu succes la $(date -u +"%Y-%m-%d %H:%M:%S UTC")."
