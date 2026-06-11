#!/bin/sh
set -e

LITESTREAM_CONFIG=/app/backend/litestream.yml

if [ -n "$MINIO_BUCKET" ]; then
  if [ ! -f "$DATABASE_PATH" ]; then
    echo "Restoring database from MinIO replica (if any)..."
    litestream restore -if-replica-exists -config "$LITESTREAM_CONFIG" "$DATABASE_PATH"
  fi
  exec litestream replicate -config "$LITESTREAM_CONFIG" -exec "$*"
fi

exec "$@"
