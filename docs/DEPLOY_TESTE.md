# BeaZap — Deploy para Ambiente de Teste

Guia para colocar a plataforma em ambiente funcional para validação por usuários.

---

## Visão geral

O BeaZap precisa de:

| Componente | Porta | Descrição |
|------------|-------|-----------|
| Backend (FastAPI) | 8000 | API principal, webhooks |
| Frontend (Next.js) | 3000 | Interface web |
| Evolution API | 8080 | WhatsApp (via Docker) |
| Evolution Manager | 8081 | Interface de gerenciamento Evolution |
| PostgreSQL | 5434 | Banco de dados (host) |

**Ponto crítico:** A Evolution API precisa alcançar o webhook do BeaZap. Se a Evolution roda em Docker e o BeaZap no host, use `http://host.docker.internal:8000` (Mac/Windows) ou o IP do host.

**Evolution Manager:** A interface em `http://SEU_IP:8081` permite gerenciar instâncias da Evolution API. Na primeira vez, informe a URL da API (`http://SEU_IP:8080`) e a chave (`AUTHENTICATION_API_KEY` do .env).

---

## Opção 1: Local + ngrok (rápido para testes)

Ideal para validação rápida com usuários remotos.

### 1. Subir a stack local

```bash
# Terminal 1 — Banco e Evolution API
docker-compose up -d

# Terminal 2 — Backend
python main.py

# Terminal 3 — Frontend
cd frontend && npm run dev
```

### 2. Expor com ngrok

```bash
# Instale ngrok: https://ngrok.com/download

# Expor backend (webhook + API)
ngrok http 8000

# Em outro terminal, expor frontend
ngrok http 3000
```

### 3. Configurar

- **Frontend:** Acesse a URL do ngrok do frontend (ex: `https://abc123.ngrok-free.app`).
- **API:** Crie `.env.local` no frontend:
  ```
  NEXT_PUBLIC_API_URL=https://SEU-NGROK-BACKEND.ngrok-free.app
  ```
  Ou use a mesma URL do ngrok do backend se frontend e backend estiverem no mesmo ngrok (não recomendado).

- **Webhook:** Em Configurações > Webhooks, use a URL do ngrok do backend:
  ```
  https://SEU-NGROK-BACKEND.ngrok-free.app
  ```
  O BeaZap montará: `https://.../webhook/{instance_name}`

### 4. CORS

No `.env` do backend, adicione:

```env
CORS_ORIGINS=https://SEU-NGROK-FRONTEND.ngrok-free.app
```

---

## Opção 2: Docker completo (tudo em containers)

Para ambiente mais próximo de produção.

### 1. Criar Dockerfile do backend

Crie `Dockerfile` na raiz:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 2. Criar Dockerfile do frontend

Crie `frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Adicione em `frontend/next.config.ts`:

```ts
output: 'standalone',
```

### 3. docker-compose completo

Adicione ao `docker-compose.yml` os serviços `beazap` e `beazap-frontend`, e configure rede, variáveis e volumes conforme sua infraestrutura.

---

## Opção 3: VPS (Dime Host, HostDime, DigitalOcean, AWS, etc.)

Sim, pode subir no VPS Dime ou qualquer provedor. Ambiente estável e acessível 24/7.

### Requisitos mínimos

- VPS com Ubuntu 22.04+ (1 GB RAM no mínimo, 2 GB recomendado)
- Domínio apontando para o IP do VPS (ou use o IP direto para testes)
- Portas 80 e 443 liberadas no firewall

### Passos no VPS

**1. Conectar via SSH**

```bash
ssh root@SEU_IP_VPS
```

**2. Script automatizado (recomendado)**

```bash
chmod +x scripts/setup-inicial.sh
./scripts/setup-inicial.sh
```

Ou para clonar e instalar em /opt/beazap:

```bash
./scripts/setup-inicial.sh --clone https://github.com/SEU_REPO/BeaZap.git
```

O script instala: Docker, Python 3, Node.js 20, sobe PostgreSQL/Redis/Evolution, configura venv e frontend.

**Alternativa manual — Instalar Docker**

```bash
apt update && apt install -y docker.io docker-compose-plugin
systemctl enable docker && systemctl start docker
```

**3. Clonar o projeto**

```bash
cd /opt
git clone https://github.com/SEU_REPO/BeaZap.git
cd BeaZap
```

**4. Configurar `.env`**

```env
DATABASE_URL=postgresql://beazap:beazap@postgres:5432/beazap
EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_API_KEY=beazap-secret-2026
SECRET_KEY=chave-forte-aleatoria
LLM_PROVIDER=openai
OPENAI_API_KEY=sua-chave
CORS_ORIGINS=https://beazap.seudominio.com
```

**5. Subir a stack**

```bash
docker-compose up -d
# Backend e frontend: rode manualmente ou adicione ao docker-compose
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 &
cd frontend && npm ci && npm run build && npm start &
```

**6. Nginx (reverse proxy + SSL)**

Instale nginx e certbot, configure o virtual host para o domínio e habilite HTTPS com Let's Encrypt. O nginx deve encaminhar:

- `/` e `/api` → backend (porta 8000)
- Ou frontend (3000) e backend (8000) em subdomínios separados

**7. Webhook**

Em Configurações > Webhooks, use a URL pública do backend, ex: `https://api.seudominio.com` ou `https://beazap.seudominio.com`.

**Sem domínio:** Use o IP do VPS (ex: `http://123.45.67.89:8000`). O webhook da Evolution precisa alcançar esse endereço — se a Evolution rodar no mesmo VPS, use `http://localhost:8080` na Evolution e `http://IP_VPS:8000` como URL do webhook no BeaZap.

---

## Variáveis de ambiente para teste

### Backend (`.env`)

```env
DATABASE_URL=postgresql://beazap:beazap@localhost:5434/beazap
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=beazap-secret-2026
SECRET_KEY=chave-forte-para-teste
LLM_PROVIDER=openai
OPENAI_API_KEY=sua-chave-openai
```

### Frontend (`.env.local`)

```env
# URL pública do backend (ngrok, VPS ou mesmo host)
NEXT_PUBLIC_API_URL=https://seu-backend-publico.com
```

### Webhook (na tela Configurações > Webhooks)

Use a URL pública do backend, por exemplo:

- Local + ngrok: `https://abc123.ngrok-free.app`
- VPS: `https://api.seudominio.com`

---

## Checklist de validação

- [ ] PostgreSQL rodando
- [ ] Evolution API rodando e instância conectada (QR Code)
- [ ] Backend respondendo em `/docs`
- [ ] Frontend carregando e conectando à API
- [ ] Webhook configurado na Evolution API com URL acessível
- [ ] CORS permitindo a origem do frontend
- [ ] Mensagem automática e demais fluxos testados

---

## Troubleshooting

| Problema | Solução |
|---------|---------|
| Webhook não recebe eventos | Evolution precisa alcançar a URL. Use `host.docker.internal` (Mac/Win) ou IP do host. Em produção, use URL pública. |
| CORS bloqueando | Adicione a origem do frontend em `allow_origins` no `main.py`. |
| Frontend não conecta à API | Verifique `NEXT_PUBLIC_API_URL` e se o backend está acessível. |
| Evolution em Docker não alcança host | Use `host.docker.internal:8000` (Mac/Win) ou o IP real da máquina na rede. |
