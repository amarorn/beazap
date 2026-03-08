#!/bin/bash
# BeaZap - Para backend e frontend
# Uso: ./scripts/stop-beazap.sh

echo "Parando BeaZap..."

BACKEND_PIDS=$(pgrep -f "python.*main.py" 2>/dev/null || true)
if [[ -n "$BACKEND_PIDS" ]]; then
  echo "$BACKEND_PIDS" | xargs kill 2>/dev/null || true
  echo "  Backend parado."
else
  echo "  Backend nao estava em execucao."
fi

FRONTEND_PIDS=$(pgrep -f "next dev" 2>/dev/null || true)
if [[ -n "$FRONTEND_PIDS" ]]; then
  echo "$FRONTEND_PIDS" | xargs kill 2>/dev/null || true
  echo "  Frontend parado."
else
  echo "  Frontend nao estava em execucao."
fi

echo ""
echo "BeaZap parado."
