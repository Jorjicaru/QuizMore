#!/usr/bin/env bash
# ==============================================================================
# CONQUIZ V9.0 – SCRIPT DE RESTAURARE POSTGRESQL DIN ARHIVĂ .sql.gz
# ==============================================================================
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Utilizare: $0 <cale_catre_backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[EROARE] Fișierul de backup nu există: ${BACKUP_FILE}"
  exit 1
fi

PG_CONTAINER="${PG_CONTAINER:-conquiz-postgres}"
POSTGRES_USER="${POSTGRES_USER:-conquiz_user}"
POSTGRES_DB="${POSTGRES_DB:-conquiz}"

echo "[RESTORE] Atenție: se va restaura baza de date '${POSTGRES_DB}' din '${BACKUP_FILE}'."
if docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
  gunzip -c "${BACKUP_FILE}" | docker exec -i "${PG_CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
  echo "[RESTORE] Restaurare în containerul '${PG_CONTAINER}' finalizată cu succes!"
elif [ -n "${DATABASE_URL:-}" ]; then
  gunzip -c "${BACKUP_FILE}" | psql -v ON_ERROR_STOP=1 "${DATABASE_URL}"
  echo "[RESTORE] Restaurare prin DATABASE_URL finalizată cu succes!"
else
  echo "[EROARE] Nu s-a găsit containerul '${PG_CONTAINER}' activ și nici variabila DATABASE_URL."
  exit 1
fi
