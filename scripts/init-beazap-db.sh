#!/bin/bash
# Cria ou corrige usuario/banco beazap no PostgreSQL
# Uso: ./scripts/init-beazap-db.sh

if ! docker ps --format '{{.Names}}' | grep -q beazap-postgres; then
  echo "Container beazap-postgres nao encontrado. Suba com: docker compose up -d"
  exit 1
fi

echo "Configurando usuario e banco beazap no PostgreSQL..."
docker exec beazap-postgres psql -U evolution -d evolution -v ON_ERROR_STOP=1 <<'EOSQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beazap') THEN
    CREATE USER beazap WITH PASSWORD 'beazap';
  ELSE
    ALTER USER beazap WITH PASSWORD 'beazap';
  END IF;
END $$;
EOSQL

docker exec beazap-postgres psql -U evolution -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE beazap OWNER beazap;" 2>/dev/null || true
docker exec beazap-postgres psql -U evolution -d evolution -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE beazap TO beazap;"

echo "Concluido."
