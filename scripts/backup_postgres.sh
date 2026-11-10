#!/usr/bin/env bash
# ==============================================================================
# CONQUIZ V9.1 – SCRIPT AUTOMAT DE BACKUP POSTGRESQL (SURSA PRINCIPALĂ DE DATE)
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

echo "[BACKUP] Începere backup PostgreSQL pentru baza de date '${POSTGRES_DB}'..."
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
  docker exec -i "${PG_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists --no-owner --no-privileges | gzip -9 > "${PG_BACKUP_FILE}"
elif [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "${DATABASE_URL}" --clean --if-exists --no-owner --no-privileges | gzip -9 > "${PG_BACKUP_FILE}"
else
  echo "[EROARE] Nici containerul Docker '${PG_CONTAINER}' nu rulează, nici variabila DATABASE_URL nu este setată." >&2
  exit 1
fi

# Verificare integritate arhivă gzip și dimensiune nenulă
gzip -t "${PG_BACKUP_FILE}"
if [ ! -s "${PG_BACKUP_FILE}" ]; then
  echo "[EROARE] Fișierul de backup generat este gol: ${PG_BACKUP_FILE}" >&2
  exit 1
fi

echo "[BACKUP] Backup PostgreSQL salvat și verificat cu succes: ${PG_BACKUP_FILE} ($(du -h "${PG_BACKUP_FILE}" | cut -f1))"

echo "[BACKUP] Curățare backup-uri PostgreSQL mai vechi de ${RETENTION_DAYS} zile..."
find "${BACKUP_DIR}" -type f -name "conquiz_pg_*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete

echo "[BACKUP] Operațiune finalizată cu succes la $(date -u +"%Y-%m-%d %H:%M:%S UTC")."
