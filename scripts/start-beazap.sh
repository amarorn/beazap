#!/bin/bash
# BeaZap - Inicia backend e frontend em background
# Uso: ./scripts/start-beazap.sh [--dir DIR]

set -e

PROJ_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case $1 in
    --dir)
      PROJ_DIR="$2"
      shift 2
      ;;
    *)
      echo "Opcao desconhecida: $1"
      exit 1
      ;;
  esac
done

cd "$PROJ_DIR"
mkdir -p logs

echo "Iniciando BeaZap em $PROJ_DIR..."

if [[ -f venv/bin/python ]]; then
  if pgrep -f "python.*main.py" >/dev/null 2>&1; then
    echo "  Backend ja em execucao."
  else
    nohup venv/bin/python main.py >> logs/backend.log 2>&1 &
    echo "  Backend iniciado (PID $!). Logs: logs/backend.log"
    sleep 2
  fi
else
  echo "  Backend: venv nao encontrado. Execute o setup primeiro."
fi

if [[ -d frontend/node_modules ]]; then
  if pgrep -f "next dev" >/dev/null 2>&1; then
    echo "  Frontend ja em execucao."
  else
    (cd frontend && nohup npm run dev -- -H 0.0.0.0 >> ../logs/frontend.log 2>&1 &)
    echo "  Frontend iniciado. Logs: logs/frontend.log"
  fi
else
  echo "  Frontend: node_modules nao encontrado. Execute npm ci no frontend."
fi

echo ""
echo "BeaZap rodando. Backend: http://localhost:8000 | Frontend: http://localhost:3000"
echo "Logs: tail -f $PROJ_DIR/logs/backend.log | tail -f $PROJ_DIR/logs/frontend.log"
