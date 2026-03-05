#!/bin/bash
# Corrige conexao do BeaZap com PostgreSQL
# Uso: ./scripts/fix-database.sh

set -e

PROJ_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJ_DIR"

echo "=== Corrigindo banco de dados BeaZap ==="

if ! docker ps --format '{{.Names}}' | grep -q beazap-postgres; then
  echo "Container beazap-postgres nao encontrado."
  echo "Execute: docker compose up -d"
  exit 1
fi

# Descobre a porta do postgres no host
PG_PORT=$(docker port beazap-postgres 5432 2>/dev/null | rev | cut -d: -f1 | rev)
if [[ -z "$PG_PORT" ]]; then
  PG_PORT=5434
  echo "Usando porta padrao: $PG_PORT"
else
  echo "PostgreSQL na porta: $PG_PORT"
fi

# Atualiza .env
if [[ -f .env ]]; then
  if grep -q "DATABASE_URL=postgresql://beazap:beazap@localhost:[0-9]*/beazap" .env; then
    sed -i.bak "s|DATABASE_URL=postgresql://beazap:beazap@localhost:[0-9]*/beazap|DATABASE_URL=postgresql://beazap:beazap@localhost:${PG_PORT}/beazap|" .env
    echo ".env atualizado para porta $PG_PORT"
  fi
fi

# Cria/corrige usuario e banco
"$PROJ_DIR/scripts/init-beazap-db.sh"

echo ""
echo "Testando conexao..."
if docker exec beazap-postgres psql -U beazap -d beazap -c "SELECT 1" >/dev/null 2>&1; then
  echo "Conexao OK. Reinicie o backend: ./scripts/stop-beazap.sh && ./scripts/start-beazap.sh"
else
  echo "Verifique os logs acima."
fi
