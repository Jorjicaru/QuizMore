#!/usr/bin/env bash
# ==============================================================================
# CONQUIZ V9.1 – SCRIPT DE RESTAURARE POSTGRESQL DIN ARHIVĂ .sql.gz
# ==============================================================================
# Utilizare:
#   ./scripts/restore_postgres.sh <cale_catre_backup.sql.gz> [nume_baza_de_date_tinta_sau_url]
# Permite restaurarea fie în baza principală, fie într-o bază separată de verificare
# (ex: conquiz_restore_verify) pentru testarea integrității datelor restaurate.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Utilizare: $0 <cale_catre_backup.sql.gz> [baza_de_date_tinta_sau_url]" >&2
  exit 1
fi

BACKUP_FILE="$1"
TARGET_OVERRIDE="${2:-}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[EROARE] Fișierul de backup nu există: ${BACKUP_FILE}" >&2
  exit 1
fi

gzip -t "${BACKUP_FILE}"

PG_CONTAINER="${PG_CONTAINER:-conquiz-postgres}"
POSTGRES_USER="${POSTGRES_USER:-conquiz_user}"
POSTGRES_DB="${TARGET_OVERRIDE:-${POSTGRES_DB:-conquiz}}"

echo "[RESTORE] Se restaurează arhiva '${BACKUP_FILE}' în ținta PostgreSQL '${POSTGRES_DB}'..."
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
  gunzip -c "${BACKUP_FILE}" | docker exec -i "${PG_CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
  echo "[RESTORE] Restaurare în containerul '${PG_CONTAINER}' (baza '${POSTGRES_DB}') finalizată cu succes!"
elif [ -n "${TARGET_OVERRIDE}" ] && [[ "${TARGET_OVERRIDE}" == postgres* ]]; then
  gunzip -c "${BACKUP_FILE}" | psql -v ON_ERROR_STOP=1 "${TARGET_OVERRIDE}"
  echo "[RESTORE] Restaurare în URL-ul țintă finalizată cu succes!"
elif [ -n "${DATABASE_URL:-}" ]; then
  gunzip -c "${BACKUP_FILE}" | psql -v ON_ERROR_STOP=1 "${DATABASE_URL}"
  echo "[RESTORE] Restaurare prin DATABASE_URL finalizată cu succes!"
else
  echo "[EROARE] Nu s-a găsit containerul '${PG_CONTAINER}' activ și nici variabila DATABASE_URL." >&2
  exit 1
fi
