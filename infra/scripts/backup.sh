#!/bin/bash
set -e

BACKUP_DIR="/opt/fieldsync/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p "${BACKUP_DIR}"
echo "[${DATE}] Iniciando backup..."

# Dump PostgreSQL
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  --format=custom > "${BACKUP_DIR}/postgres_${DATE}.dump"

# Remover backups antigos
find "${BACKUP_DIR}" -mtime +${RETENTION_DAYS} -delete

echo "[${DATE}] Backup concluído."
