#!/bin/bash
# Cria usuario e banco beazap no PostgreSQL (quando init-postgres.sh nao rodou)
# Uso: ./scripts/init-beazap-db.sh

if ! docker ps --format '{{.Names}}' | grep -q beazap-postgres; then
  echo "Container beazap-postgres nao encontrado. Suba com: docker compose up -d"
  exit 1
fi

echo "Criando usuario e banco beazap no PostgreSQL..."
docker exec beazap-postgres psql -U evolution -d evolution -v ON_ERROR_STOP=1 <<'EOSQL'
CREATE USER beazap WITH PASSWORD 'beazap';
CREATE DATABASE beazap OWNER beazap;
GRANT ALL PRIVILEGES ON DATABASE beazap TO beazap;
EOSQL

echo "Concluido. BeaZap pode conectar ao banco."
