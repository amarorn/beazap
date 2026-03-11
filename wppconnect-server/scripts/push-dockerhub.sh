#!/usr/bin/env bash
# Publica wppconnect-server-beazap no Docker Hub.
# Uso: export DOCKERHUB_USER=<seu_login_dockerhub> && ./scripts/push-dockerhub.sh
set -euo pipefail
cd "$(dirname "$0")/.."
RAW_USER="${DOCKERHUB_USER:?Defina DOCKERHUB_USER com seu login real do hub.docker.com}"
USER="$(echo "$RAW_USER" | tr '[:upper:]' '[:lower:]')"
# Evita push para namespace inexistente (ex. copiar exemplo da doc literalmente)
case "$USER" in
  seu_usuario|seu_usuario_dockerhub|meudockerhub|meuusuario|example|dockerhub)
    echo "Erro: DOCKERHUB_USER='${USER}' parece placeholder da documentacao."
    echo "Use seu login real: export DOCKERHUB_USER=joseamaro   (o que aparece em hub.docker.com)"
    exit 1
    ;;
esac
if [[ "$USER" != "$RAW_USER" ]]; then
  echo "Aviso: Docker Hub exige lowercase; usando ${USER}"
fi
IMAGE_LOCAL="wppconnect-server-beazap"
IMAGE_REMOTE="${USER}/${IMAGE_LOCAL}"
TAG_VERSION="${TAG_VERSION:-2.9.0}"

echo "Building ${IMAGE_LOCAL}..."
docker compose build

echo "Tagging ${IMAGE_REMOTE}:latest e :${TAG_VERSION}..."
docker tag "${IMAGE_LOCAL}:latest" "${IMAGE_REMOTE}:latest"
docker tag "${IMAGE_LOCAL}:latest" "${IMAGE_REMOTE}:${TAG_VERSION}"

echo "Pushing..."
if ! docker push "${IMAGE_REMOTE}:latest"; then
  echo ""
  echo "Push negado (denied). Confira:"
  echo "  1) docker login   (mesmo usuario que DOCKERHUB_USER)"
  echo "  2) Repositorio criado em hub.docker.com: ${USER}/wppconnect-server-beazap"
  echo "  3) DOCKERHUB_USER e o login da conta, nao um nome de exemplo da doc"
  exit 1
fi
docker push "${IMAGE_REMOTE}:${TAG_VERSION}"

echo "Pronto: ${IMAGE_REMOTE}:latest e :${TAG_VERSION}"
