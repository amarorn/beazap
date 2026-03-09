# Documentação Completa da Aplicação BeaZap

## 1. Visão Geral

O **BeaZap** é uma plataforma de atendimento WhatsApp com foco em operação e gestão:

- ingestão em tempo real de eventos da Evolution API;
- central de conversas (atendimento individual e grupos);
- gestão de instâncias, atendentes, equipes e templates;
- métricas operacionais (SLA, volume, status, performance);
- recursos de IA (análise, sugestões, tradução, feedback, insights, churn);
- integração com Databricks para disparo de jobs por palavra-chave.

## 2. Arquitetura

### 2.1 Backend

- **Stack:** FastAPI + SQLAlchemy + Pydantic
- **Entrada principal:** `main.py`
- **Banco:** PostgreSQL (padrão) ou SQLite (dev)
- **Eventos em tempo real:** SSE (`/api/events`)
- **Inicialização:** cria tabelas e executa migrações incrementais em runtime

### 2.2 Frontend

- **Stack:** Next.js (App Router) + React Query + Tailwind
- **Contexto global:** seleção de instância ativa
- **Atualização em tempo real:** assinatura SSE para invalidar caches de dashboard/conversas/grupos/ligações

### 2.3 Infra de Mensageria WhatsApp

- Evolution API + Evolution Manager (Docker)
- PostgreSQL + Redis em `docker-compose.yml`
- Webhook configurável por instância

### 2.4 IA e integrações externas

- **LLM Provider configurável:** OpenAI (`gpt-4o-mini`) ou Anthropic (`claude-haiku-4-5-20251001`)
- **Databricks:** trigger de `jobs/run-now`, validação de payload e monitoramento de execuções

---

## 3. Funcionalidades Implementadas

## 3.1 Gestão de instâncias WhatsApp

Funcionalidades:

- cadastrar instância (`name`, `instance_name`, `api_url`, `api_key`, telefone, email responsável);
- tentativa automática de criar/conectar instância na Evolution;
- leitura de QR Code atual;
- envio de QR Code por e-mail (SMTP);
- checagem de status de conexão da instância;
- atualização de dados da instância;
- desativação lógica da instância;
- configuração e leitura de webhook por instância;
- configuração de mensagem inicial automática por instância.

Como funciona:

1. ao criar/editar instância, o backend chama Evolution API;
2. se houver QR disponível, ele é retornado para o frontend;
3. no frontend, existe modal de QR com auto-refresh e verificação periódica de conexão;
4. opcionalmente, o QR é enviado por e-mail ao responsável.

## 3.2 Ingestão de webhooks e ciclo de conversa

Eventos tratados:

- `messages.upsert`
- `messages.update`
- `groups.upsert`, `groups.update`, `group.update`, `group.participants.update`
- `call`

Comportamento principal:

- normaliza payloads de mensagens;
- cria/atualiza conversa aberta por contato;
- salva mensagens inbound/outbound com tipo (`text`, `image`, `audio`, `call`, etc.);
- deduplica por `evolution_id`;
- calcula `first_response_at` e `first_response_time_seconds`;
- incrementa contadores `inbound_count`/`outbound_count`;
- envia mensagem automática inicial em novos atendimentos (quando habilitado);
- dispara roteamento por equipe em background para novas conversas;
- dispara validação/trigger Databricks para mensagens inbound elegíveis;
- marca mensagens apagadas (`is_deleted = true`) via `messages.update`.

## 3.3 Dashboard operacional

Tela `/` com:

- KPIs de conversas e mensagens (com comparação);
- métricas estendidas (SLA, abandono, sem resposta 1h/4h, tempo de resolução);
- métricas de grupos;
- widget de alertas SLA;
- gráficos: volume diário, pico por hora, status diário, SLA diário, análise LLM;
- tabela de performance por atendente;
- lista de conversas recentes.

## 3.4 Gestão de atendimentos (conversas)

Tela `/conversations`:

- filtros por status e atendente;
- atribuição de atendente em conversa aberta;
- ação de resolver conversa;
- ação de analisar conversa por IA;
- navegação para detalhe da conversa.

Tela `/conversations/[id]`:

- timeline completa de mensagens;
- envio de mensagem para o cliente;
- templates de resposta rápida;
- sugestão de resposta por IA (auto ao chegar nova inbound);
- tradução automática de mensagens inbound para PT (quando necessário);
- tradução outgoing para idioma do cliente ao enviar;
- resolução da conversa;
- análise da conversa sob demanda;
- notas internas manuais;
- exibição de notas tipo `resumo_llm`;
- contexto com resumos de conversas anteriores do mesmo contato;
- salvar contato da conversa na base de contatos;
- tratamento de contatos LID com fallback para Evolution Manager e definição manual de `send_jid`.

## 3.5 Base de contatos

Tela `/contacts`:

- listagem de contatos com instância, primeiro/último contato;
- edição de nome, telefone e `contact_send_jid`;
- remoção de contato;
- exibição especial para contatos LID.

Regras de backend:

- contato pode ser salvo diretamente a partir da conversa;
- status de “contato salvo” por conversa;
- priorização de `contact_send_jid` para envio quando disponível.

## 3.6 Gestão de grupos

Tela `/groups`:

- visão de grupos monitorados;
- KPIs de grupos (total, ativos, com/sem responsável, mensagens do dia);
- sincronização de nomes/imagens de grupos com Evolution API;
- filtro por tags;
- configuração por grupo:
  - responsável;
  - gerente;
  - tags.

Tela `/groups/[id]`:

- visualização de mensagens de grupo por dia;
- identificação do remetente nas mensagens inbound.

## 3.7 Ligações

Tela `/calls`:

- histórico de ligações inbound/outbound;
- duração e status da chamada;
- indicador de chamada de vídeo;
- filtro por direção;
- atalho para abrir a conversa relacionada.

## 3.8 Equipes e roteamento

Tela `/teams`:

- criar/remover equipes;
- definir descrição e palavras-chave;
- vincular atendentes à equipe;
- visualizar métricas de performance por equipe.

Roteamento automático:

- para novas conversas, serviço de roteamento LLM tenta atribuir `team_id` com base nas primeiras mensagens inbound e na descrição/keywords das equipes.

## 3.9 Atendentes

Tela `/attendants`:

- cadastro de agente/gerente;
- edição e remoção;
- métricas individuais (total, abertos, resolvidos, abandonados, tempo de resposta, taxa, msgs enviadas).

## 3.10 Configurações

Seção `/settings`:

- **Instâncias:** CRUD + status + QR + envio de QR por e-mail + auto-config de webhook recomendado.
- **Equipe:** CRUD simples de atendentes (atalho legado).
- **Mensagens:**
  - mensagem inicial automática por instância (`{nome_atendente}` suportado);
  - templates de resposta rápida (quick replies).
- **Webhooks:** configuração visual de URL, eventos, flags `webhookByEvents` e `webhookBase64`.
- **Alertas:** threshold de SLA armazenado em `localStorage` (impacta badges/alertas no frontend).
- **Configuração de IA (local):** tom de voz da empresa salvo em `localStorage` para orientar sugestões.

## 3.11 Relatórios

Tela `/reports` com abas:

- **Executivo**
- **Atendentes**
- **SLA**
- **Análise LLM**
- **Volume**
- **Equipes**
- **Resumos das conversas**
- **Avaliação IA** (resumo semanal por atendente)

Recursos:

- exportação CSV/Excel/PDF por aba;
- geração de relatório semanal via pipeline em background (`/api/reports/generate`);
- diagnóstico de tabelas RAW (`/api/reports/debug`).

Pipeline de relatório IA semanal:

1. popula `atendimento_raw`;
2. agrega para `cliente_atend_raw`;
3. agrega para `atendente_raw`;
4. gera resumo LLM e salva `llm_summary` por atendente.

## 3.12 Insights com IA

Tela `/insights` com abas:

- tópicos emergentes;
- anomalias de métricas;
- anomalias de sentimento;
- previsão de churn.

Todos os fluxos usam endpoints de `metrics` + serviços LLM especializados.

## 3.13 Integração Databricks

Tela `/databricks`:

- configuração de workspace/token/job/keyword;
- regex e regras de validação de `codigo_cliente`;
- preview de validação de mensagem;
- simulação de trigger manual;
- visualização de `notebook_params` gerados;
- preview de resposta de erro enviada ao usuário (quando inválido);
- histórico de execuções com refresh de status.

Fluxo automatizado por webhook:

1. mensagem inbound contém keyword;
2. extrai `codigo_cliente` por regex;
3. valida tamanho/regras;
4. se inválido, envia resposta de erro via WhatsApp (opcional);
5. se válido, dispara job Databricks em thread assíncrona e registra execução.

## 3.14 Recursos de IA aplicados ao atendimento

Implementado no backend:

- análise de conversa (`category`, `sentiment`, `satisfaction`, `summary`);
- resumo automático ao resolver (nota `resumo_llm`);
- sugestões de resposta adaptadas ao contexto;
- rascunho completo de resposta com `confidence_score`;
- classificação de intenção com roteamento sugerido;
- fluxo de automação de intenção/resposta/confirmação;
- feedback estruturado da atuação do atendente;
- tradução inbound/outbound com detecção de idioma.

---

## 4. Modelo de Dados (resumo)

Entidades principais:

- `instances`
- `attendants`
- `teams`
- `conversations`
- `messages`
- `contacts`
- `conversation_notes`
- `quick_replies`
- `databricks_configs`
- `databricks_job_runs`
- `atendimento_raw`
- `cliente_atend_raw`
- `atendente_raw`

Campos de destaque:

- `conversations`: status, tempos de resposta/resolução, análise IA, idioma cliente, vínculos de grupo/equipe, JIDs de contato/envio;
- `messages`: direção, tipo, conteúdo, remetente em grupo, metadados de ligação;
- `contacts`: telefone, jid original, jid para envio e avatar.

---

## 5. API REST e SSE

Base principal: `http://<host>:8000`

## 5.1 Dashboard HTML legado

- `GET /`
- `GET /conversations`
- `GET /settings`

## 5.2 Webhooks

- `POST /webhook/{path:path}`
- rotas de evento dedicadas também existem no root (`/messages-upsert`, `/groups-update`, etc.) mapeando para o mesmo handler interno.

## 5.3 Eventos em tempo real (SSE)

- `GET /api/events`

Eventos broadcast:

- `new_message`
- `message_updated`
- `groups_updated`
- `new_call`
- `heartbeat` (manutenção de conexão)

## 5.4 Instâncias e atendentes

- `GET /api/instances`
- `POST /api/instances`
- `GET /api/instances/{instance_id}/qrcode`
- `POST /api/instances/{instance_id}/send-qrcode-email`
- `POST /api/instances/{instance_id}/webhook`
- `GET /api/instances/{instance_id}/webhook`
- `GET /api/instances/{instance_id}/status`
- `PUT /api/instances/{instance_id}`
- `GET /api/instances/{instance_id}/auto-message`
- `PUT /api/instances/{instance_id}/auto-message`
- `DELETE /api/instances/{instance_id}`
- `GET /api/attendants`
- `POST /api/attendants`
- `PUT /api/attendants/{attendant_id}`
- `DELETE /api/attendants/{attendant_id}`

## 5.5 Times

- `GET /api/teams`
- `POST /api/teams`
- `DELETE /api/teams/{team_id}`

## 5.6 Quick replies

- `GET /api/quick-replies`
- `POST /api/quick-replies`
- `PUT /api/quick-replies/{qr_id}`
- `DELETE /api/quick-replies/{qr_id}`

## 5.7 Métricas, conversas, IA e grupos

Prefixo: `/api/metrics`

- Overview/extended/charts:
  - `GET /overview`
  - `GET /extended`
  - `GET /extended/daily`
  - `GET /overview-comparison`
  - `GET /hourly-volume`
  - `GET /daily-volume`
  - `GET /daily-sla`
  - `GET /daily-status`
  - `GET /teams`
  - `GET /attendants`
- Conversas:
  - `GET /conversations`
  - `GET /conversations/{conversation_id}`
  - `GET /conversations/{conversation_id}/messages`
  - `POST /conversations/{conversation_id}/resolve`
  - `PATCH /conversations/{conversation_id}/assign`
  - `PATCH /conversations/{conversation_id}/send-jid`
  - `POST /conversations/{conversation_id}/send`
- Contatos:
  - `GET /contacts`
  - `PATCH /contacts/{contact_id}`
  - `DELETE /contacts/{contact_id}`
  - `GET /conversations/{conversation_id}/contact-status`
  - `POST /conversations/{conversation_id}/save-contact`
- IA atendimento:
  - `GET /conversations/{conversation_id}/suggestions`
  - `GET /conversations/{conversation_id}/draft`
  - `POST /conversations/{conversation_id}/classify-intent`
  - `POST /conversations/{conversation_id}/automation/classify`
  - `POST /automation/generate-response`
  - `POST /automation/confirm`
  - `POST /conversations/{conversation_id}/analyze`
  - `POST /conversations/{conversation_id}/feedback`
  - `GET /analysis-stats`
- Insights:
  - `GET /churn/predict`
  - `GET /trends/emerging-topics`
  - `GET /trends/metric-anomalies`
  - `GET /trends/sentiment-anomalies`
- Grupos e SLA:
  - `GET /groups/overview`
  - `POST /groups/sync-names`
  - `GET /groups`
  - `PATCH /groups/{group_id}/config`
  - `GET /groups/{conversation_id}/messages`
  - `GET /sla-alerts`
- Ligações:
  - `GET /calls`
- Notas e contexto:
  - `GET /conversations/{conversation_id}/notes`
  - `POST /conversations/{conversation_id}/notes`
  - `DELETE /conversations/{conversation_id}/notes/{note_id}`
  - `GET /conversations/{conversation_id}/context-summaries`
  - `GET /conversation-summaries`

## 5.8 Relatórios

Prefixo: `/api/reports`

- `POST /generate`
- `GET /attendant-summaries`
- `GET /debug`

## 5.9 Tradução

Prefixo: `/api/translation`

- `POST /incoming`
- `POST /outgoing`
- `GET /idiomas`

## 5.10 Databricks

Prefixo: `/api/databricks`

- `GET /config`
- `POST /config`
- `POST /validate`
- `POST /trigger`
- `GET /runs`
- `POST /runs/{run_id}/refresh`

---

## 6. Páginas Frontend

- `/` Dashboard
- `/conversations` Lista de atendimentos
- `/conversations/[id]` Detalhe da conversa
- `/contacts` Base de contatos
- `/calls` Ligações
- `/groups` Gestão de grupos
- `/groups/[id]` Detalhe do grupo
- `/teams` Gestão de equipes
- `/attendants` Gestão de atendentes
- `/reports` Relatórios e exportações
- `/insights` Insights com IA
- `/databricks` Integração Databricks
- `/settings` Instâncias + IA
- `/settings/team` Equipe (atalho)
- `/settings/messages` Mensagens automáticas e templates
- `/settings/webhooks` Configuração de webhooks
- `/settings/notifications` Alertas de SLA

---

## 7. Configuração e Execução

## 7.1 Variáveis principais (`.env`)

- `DATABASE_URL`
- `SECRET_KEY`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_DATABASE_URI` (opcional, cache LID)
- `LLM_PROVIDER` (`openai`/`anthropic`)
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- `CORS_ORIGINS`

## 7.2 Dependências backend

- FastAPI, Uvicorn, SQLAlchemy, Pydantic
- Httpx
- OpenAI/Anthropic SDKs
- qrcode
- psycopg2-binary

## 7.3 Dependências frontend

- Next.js + React 19
- React Query
- Axios
- Recharts
- jsPDF/xlsx (exportações)

## 7.4 Scripts úteis

- `scripts/setup-inicial.sh` (provisionamento completo)
- `scripts/start-beazap.sh` (sobe backend/frontend)
- `scripts/stop-beazap.sh` (para backend/frontend)
- `scripts/init-beazap-db.sh` (garante usuário/banco `beazap`)
- `scripts/fix-database.sh` (corrige conexão com Postgres)
- scripts LID Evolution:
  - `scripts/evolution_register_lid.py`
  - `scripts/evolution_flush_cache_and_register_lid.py`

---

## 8. Fluxos críticos de negócio

## 8.1 Novo atendimento inbound

1. Evolution envia `messages.upsert`;
2. backend cria/atualiza conversa aberta;
3. salva mensagem inbound;
4. dispara SSE `new_message`;
5. executa roteamento de equipe em background;
6. opcionalmente envia mensagem automática inicial.

## 8.2 Resolução de conversa

1. usuário clica “Resolver”;
2. conversa recebe status `resolved` + `resolved_at`;
3. em background:
   - análise LLM da conversa;
   - geração de resumo final (`resumo_llm`) salvo como nota.

## 8.3 Envio de mensagem com fallback LID

1. backend tenta enviar via Evolution com número/JID resolvido;
2. em LID com falha, retorna orientação de fallback;
3. frontend oferece:
   - copiar texto;
   - abrir Evolution Manager;
   - definir manualmente `send_jid` e reenviar.

## 8.4 Trigger Databricks por WhatsApp

1. mensagem inbound contém keyword;
2. extrai código de cliente via regex;
3. valida limites configurados;
4. inválido: responde erro no WhatsApp (se habilitado);
5. válido: dispara job Databricks e registra run.

---

## 9. Observações técnicas importantes

- As migrações são incrementais via `ALTER TABLE` em runtime (não Alembic).
- Existe interface HTML legada (`app/templates`) além do frontend Next.js.
- O frontend resolve a URL da API dinamicamente para `:8000` no mesmo host.
- Seleção de instância impacta quase todas as consultas de métricas.
- Alertas SLA usam threshold local no navegador (`localStorage`).

---

## 10. Riscos e melhorias recomendadas

- remover chave real de API do código e manter somente via ambiente;
- migrar migrações manuais para Alembic;
- adicionar autenticação/autorização para endpoints administrativos;
- reforçar mascaramento de dados sensíveis em logs;
- adicionar testes automatizados para fluxos críticos (webhook, envio, resolução, Databricks).
