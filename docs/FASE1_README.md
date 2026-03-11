# BeaZap Fase 1 - Núcleo de Mensageria Event-Driven

## Variáveis de ambiente

```bash
# Obrigatórias (já existentes)
DATABASE_URL=postgresql://evolution:evolution123@localhost:5434/evolution
REDIS_URL=redis://localhost:6381

# Kafka/Redpanda
KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# WPPConnect
WPPCONNECT_API_URL=http://localhost:21465
WPPCONNECT_API_KEY=
WPPCONNECT_SECRET=beazap-secret-2026

# Multi-tenant (default)
DEFAULT_TENANT_ID=1
```

## Dependências

```bash
docker compose up -d postgres redis redpanda wppconnect
# Criar tópicos Kafka (opcional - Redpanda cria sob demanda)
docker compose run --rm init-kafka
```

## Rodar API

```bash
source .venv/bin/activate
pip install -r requirements.txt
python main.py
# ou: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Rodar workers

Terminal 1 - Message processor (wa.raw-events -> persist -> wa.normalized-events):
```bash
python -m app.workers.message_processor
```

Terminal 2 - Sender worker (message.outbound.requested -> send -> sent/failed):
```bash
python -m app.workers.sender_worker
```

## Endpoints v2

### POST /api/v2/connections/start
```json
{
  "tenant_id": "1",
  "connection_id": "3",
  "session_name": "default"
}
```

### POST /api/v2/messages/send
```json
{
  "tenant_id": "1",
  "connection_id": "3",
  "phone_number": "5511999999999",
  "text": "Olá!"
}
```

## Fluxo inbound

1. WPPConnect envia webhook -> POST /webhook/default
2. Webhook publica wa.raw-events
3. message_processor consome, aplica idempotência, persiste Message
4. message_processor publica wa.normalized-events

## Fluxo outbound

1. Cliente chama POST /api/v2/messages/send
2. API cria Message status=pending, publica message.outbound.requested
3. sender_worker consome, chama provider.send_text
4. sender_worker atualiza status (sent/failed) e publica message.outbound.sent ou .failed

## Checklist de validação

- [ ] `docker compose up -d` sobe postgres, redis, redpanda, wppconnect
- [ ] API responde em http://localhost:8000
- [ ] POST /api/v2/connections/start retorna status e qr_code
- [ ] POST /api/v2/messages/send retorna message_id e status=pending
- [ ] message_processor consome wa.raw-events e persiste
- [ ] sender_worker envia via WPPConnect e publica sent/failed
- [ ] Endpoints legados (/api/metrics, etc) continuam funcionando
