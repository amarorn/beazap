#!/bin/bash
# BeaZap - Setup inicial automatizado
# Uso: ./scripts/setup-inicial.sh [--clone URL] [--dir DIR]
# Exemplo: ./scripts/setup-inicial.sh --clone https://github.com/user/BeaZap.git
# Ou, dentro do repo: ./scripts/setup-inicial.sh

set -e

# Evita avisos de locale do perl/dpkg
export LC_ALL=C.UTF-8
export LANG=C.UTF-8

REPO_URL=""
INSTALL_DIR=""
SKIP_DOCKER=false
SKIP_PYTHON=false
SKIP_NODE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --clone)
      REPO_URL="$2"
      shift 2
      ;;
    --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --skip-docker)
      SKIP_DOCKER=true
      shift
      ;;
    --skip-python)
      SKIP_PYTHON=true
      shift
      ;;
    --skip-node)
      SKIP_NODE=true
      shift
      ;;
    *)
      echo "Opcao desconhecida: $1"
      exit 1
      ;;
  esac
done

# Diretorio do projeto
if [[ -n "$INSTALL_DIR" ]]; then
  PROJ_DIR="$INSTALL_DIR"
elif [[ -n "$REPO_URL" ]]; then
  PROJ_DIR="/opt/beazap"
  mkdir -p /opt
else
  PROJ_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

echo "=========================================="
echo "  BeaZap - Setup Inicial"
echo "=========================================="
echo "Diretorio: $PROJ_DIR"
echo ""

# Detecta OS
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_VERSION="${VERSION_ID:-}"
else
  OS_ID="unknown"
fi

# Funcao para comando com sudo se necessario
run() {
  if [[ $EUID -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

# 1. Atualizar sistema
echo "[1/8] Atualizando sistema..."
if [[ "$OS_ID" == "ubuntu" ]] || [[ "$OS_ID" == "debian" ]]; then
  run apt-get update -qq
  run apt-get install -y -qq curl git ca-certificates gnupg
elif [[ "$OS_ID" == "centos" ]] || [[ "$OS_ID" == "rhel" ]] || [[ "$OS_ID" == "rocky" ]]; then
  run yum install -y -q curl git ca-certificates
else
  echo "OS $OS_ID pode precisar de instalacao manual de: curl, git"
fi

# 2. Instalar Docker
if [[ "$SKIP_DOCKER" != "true" ]]; then
  echo "[2/8] Instalando Docker..."
  if command -v docker &>/dev/null; then
    echo "  Docker ja instalado: $(docker --version)"
  else
    if [[ "$OS_ID" == "ubuntu" ]] || [[ "$OS_ID" == "debian" ]]; then
      run apt-get install -y -qq ca-certificates curl gnupg
      run install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/${OS_ID}/gpg | run gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      run chmod a+r /etc/apt/keyrings/docker.gpg
      DOCKER_CODENAME=$(. /etc/os-release && echo "${VERSION_CODENAME:-$VERSION_ID}")
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS_ID} ${DOCKER_CODENAME} stable" | run tee /etc/apt/sources.list.d/docker.list > /dev/null
      run apt-get update -qq
      run apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      run systemctl enable docker
      run systemctl start docker
      if [[ $EUID -ne 0 ]] && ! groups | grep -q docker; then
        run usermod -aG docker "$USER"
        echo "  Usuario $USER adicionado ao grupo docker. Faca logout/login ou execute: newgrp docker"
      fi
    elif [[ "$OS_ID" == "centos" ]] || [[ "$OS_ID" == "rhel" ]] || [[ "$OS_ID" == "rocky" ]]; then
      run yum install -y -q yum-utils
      run yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
      run yum install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
      run systemctl enable docker
      run systemctl start docker
    else
      echo "  Instale Docker manualmente: https://docs.docker.com/engine/install/"
      exit 1
    fi
  fi
else
  echo "[2/8] Pulando Docker (--skip-docker)"
fi

# 3. Instalar Python 3.11+
if [[ "$SKIP_PYTHON" != "true" ]]; then
  echo "[3/8] Instalando Python..."
  if command -v python3 &>/dev/null; then
    PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0")
    if python3 -c "import sys; exit(0 if sys.version_info >= (3, 11) else 1)" 2>/dev/null; then
      echo "  Python ja instalado: $(python3 --version)"
    else
      echo "  Python $PY_VER encontrado. BeaZap recomenda 3.11+."
    fi
  else
    if [[ "$OS_ID" == "ubuntu" ]] || [[ "$OS_ID" == "debian" ]]; then
      run apt-get install -y -qq python3 python3-pip python3-venv
    elif [[ "$OS_ID" == "centos" ]] || [[ "$OS_ID" == "rhel" ]] || [[ "$OS_ID" == "rocky" ]]; then
      run yum install -y -q python3 python3-pip
    fi
  fi
else
  echo "[3/8] Pulando Python (--skip-python)"
fi

# 4. Instalar Node.js 20 LTS
if [[ "$SKIP_NODE" != "true" ]]; then
  echo "[4/8] Instalando Node.js..."
  if command -v node &>/dev/null; then
    NODE_VER=$(node -v 2>/dev/null | sed 's/v//')
    echo "  Node.js ja instalado: $(node -v)"
  else
    if [[ "$OS_ID" == "ubuntu" ]] || [[ "$OS_ID" == "debian" ]]; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | run bash -
      run apt-get install -y -qq nodejs
    elif [[ "$OS_ID" == "centos" ]] || [[ "$OS_ID" == "rhel" ]] || [[ "$OS_ID" == "rocky" ]]; then
      curl -fsSL https://rpm.nodesource.com/setup_20.x | run bash -
      run yum install -y -q nodejs
    else
      echo "  Instale Node.js 20 manualmente: https://nodejs.org/"
    fi
  fi
else
  echo "[4/8] Pulando Node.js (--skip-node)"
fi

# 5. Clonar ou usar diretorio atual
echo "[5/8] Preparando codigo fonte..."
if [[ -n "$REPO_URL" ]]; then
  if [[ -d "$PROJ_DIR/.git" ]]; then
    echo "  Diretorio $PROJ_DIR ja existe. Atualizando..."
    (cd "$PROJ_DIR" && git pull)
  else
    run mkdir -p "$(dirname "$PROJ_DIR")"
    run git clone "$REPO_URL" "$PROJ_DIR"
  fi
fi

if [[ ! -d "$PROJ_DIR" ]]; then
  echo "Erro: diretorio $PROJ_DIR nao existe."
  exit 1
fi

cd "$PROJ_DIR"

# host.docker.internal no Linux (Evolution acessar webhook no host)
if [[ "$OS_ID" == "ubuntu" ]] || [[ "$OS_ID" == "debian" ]] || [[ "$OS_ID" == "centos" ]] || [[ "$OS_ID" == "rhel" ]] || [[ "$OS_ID" == "rocky" ]]; then
  if [[ ! -f docker-compose.override.yml ]]; then
    echo "  Criando docker-compose.override.yml para host.docker.internal (Linux)"
    cat > docker-compose.override.yml <<'OVERRIDE'
services:
  evolution:
    extra_hosts:
      - "host.docker.internal:host-gateway"
OVERRIDE
  fi
fi

# 6. Docker Compose
echo "[6/8] Subindo PostgreSQL, Redis e Evolution API..."
if [[ "$SKIP_DOCKER" != "true" ]]; then
  if [[ $EUID -ne 0 ]] && ! groups | grep -q docker; then
    echo "  Execute 'newgrp docker' ou faca logout/login e rode novamente para subir os containers."
  else
    echo "  (pode demorar 1-2 min para baixar imagens)"
    (cd "$PROJ_DIR" && (docker compose up -d 2>/dev/null || run docker compose up -d))
    echo "  Aguardando PostgreSQL..."
    for i in {1..30}; do
      if docker exec beazap-postgres pg_isready -U evolution 2>/dev/null; then
        break
      fi
      sleep 1
    done
  fi
fi

# 7. Backend Python
echo "[7/8] Configurando backend..."
if [[ "$SKIP_PYTHON" != "true" ]] && [[ -f "$PROJ_DIR/requirements.txt" ]]; then
  cd "$PROJ_DIR"
  if [[ "$OS_ID" == "ubuntu" ]] || [[ "$OS_ID" == "debian" ]]; then
    run apt-get install -y -qq python3-venv 2>/dev/null || run apt-get install -y -qq python3.11-venv 2>/dev/null || true
  fi
  if [[ -d venv ]] && [[ ! -f venv/bin/activate ]]; then
    rm -rf venv
  fi
  if [[ -d venv ]] && ! venv/bin/python3 -c "import sys" 2>/dev/null; then
    rm -rf venv
  fi
  if [[ ! -d venv ]] || [[ ! -f venv/bin/activate ]]; then
    echo "  Criando venv..."
    if ! python3 -m venv venv; then
      echo "Erro ao criar venv. Verifique: apt install python3.11-venv"
      exit 1
    fi
  fi
  if [[ ! -f venv/bin/activate ]]; then
    echo "Erro: venv/bin/activate nao encontrado apos criacao."
    exit 1
  fi
  source "$PROJ_DIR/venv/bin/activate"
  pip install -q -r requirements.txt
  if [[ ! -f .env ]]; then
    cp .env.example .env
    echo "  .env criado a partir de .env.example. Edite com suas chaves (OPENAI_API_KEY, etc)."
  else
    echo "  .env ja existe."
  fi
  echo "  Migracoes serao executadas na primeira execucao do backend."
  deactivate 2>/dev/null || true
fi

# 8. Frontend
echo "[8/8] Configurando frontend..."
if [[ "$SKIP_NODE" != "true" ]] && [[ -d "$PROJ_DIR/frontend" ]]; then
  cd "$PROJ_DIR/frontend"
  if [[ ! -d node_modules ]]; then
    npm ci
  fi
  if [[ ! -f .env.local ]]; then
    echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
    echo "  frontend/.env.local criado."
  fi
  npm run build
  cd "$PROJ_DIR"
fi

echo ""
echo "=========================================="
echo "  Setup concluido!"
echo "=========================================="
echo ""
echo "Proximos passos:"
echo ""
echo "1. Edite o .env com suas chaves (OPENAI_API_KEY ou ANTHROPIC_API_KEY):"
echo "   nano $PROJ_DIR/.env"
echo ""
echo "2. Inicie o backend:"
echo "   cd $PROJ_DIR && source venv/bin/activate && python main.py"
echo ""
echo "3. Em outro terminal, inicie o frontend:"
echo "   cd $PROJ_DIR/frontend && npm start"
echo ""
echo "4. Acesse: http://localhost:3000"
echo ""
echo "5. Configure o webhook em Configuracoes > Webhooks."
echo "   URL base: http://SEU_IP:8000 ou http://host.docker.internal:8000 (se Evolution no Docker)"
echo ""
