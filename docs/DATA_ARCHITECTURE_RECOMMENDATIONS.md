# Recomendações de Arquitetura de Dados — BeaZap

Documento elaborado sob a perspectiva de um Arquiteto de Dados, com base na análise do projeto e nas práticas do skill data-architect.

---

## 1. Visão geral do domínio

O BeaZap é um sistema de **métricas de atendimento WhatsApp** com:

- **Ingestão em tempo real**: webhooks da Evolution API (mensagens, grupos, chamadas)
- **Processamento assíncrono**: roteamento LLM, análise de conversas
- **Consultas analíticas**: dashboards, SLA, volume por período
- **Operacional**: atribuição de atendentes, envio de mensagens

---

## 2. Modelo de dados atual

### Entidades principais

| Entidade      | Tabela         | Crescimento | Padrão de acesso      |
|---------------|----------------|-------------|------------------------|
| Instance      | instances      | Baixo       | PK, listagem           |
| Conversation  | conversations  | Médio       | instance_id, status, data |
| Message       | messages       | Alto        | conversation_id, timestamp |
| Attendant     | attendants     | Baixo       | instance_id            |
| Team          | teams          | Baixo       | instance_id            |

### Relacionamentos

```
Instance (1) ──< (N) Conversation, Attendant, Team
Conversation (1) ──< (N) Message
Conversation (N) ──> (1) Attendant, Team
```

### Pontos críticos do modelo

1. **messages** é a tabela de maior volume e crescimento contínuo
2. **conversations** concentra filtros por `instance_id`, `status`, `opened_at`
3. Ausência de índices compostos para os padrões de query mais frequentes

---

## 3. Recomendações de banco de dados

### 3.1 Escolha de tecnologia

| Cenário              | Recomendação   | Justificativa                                      |
|----------------------|----------------|----------------------------------------------------|
| Desenvolvimento      | SQLite         | Simplicidade, zero setup                           |
| Produção (até ~10k msgs/dia) | PostgreSQL | Concorrência, ACID, índices avançados             |
| Produção (alto volume) | PostgreSQL + particionamento | Escala com particionamento por data |

**PostgreSQL** é a escolha recomendada para produção porque:

- Suporta concorrência de webhooks e consultas simultâneas
- Oferece índices parciais, GIN e expressões
- Permite particionamento por data em `messages`
- Connection pooling nativo (PgBouncer)

### 3.2 Índices recomendados

```sql
-- Filtros por instância e data (queries de métricas)
CREATE INDEX idx_conversations_instance_opened 
  ON conversations(instance_id, opened_at);

CREATE INDEX idx_conversations_instance_status 
  ON conversations(instance_id, status);

-- Join Message–Conversation e filtro por data
CREATE INDEX idx_messages_conv_ts 
  ON messages(conversation_id, timestamp);

-- Deduplicação e lookup por evolution_id (já existe como unique)
-- Garantir: CREATE UNIQUE INDEX ON messages(evolution_id);

-- SLA: conversas abertas sem primeira resposta
CREATE INDEX idx_conversations_sla 
  ON conversations(instance_id, status) 
  WHERE status = 'open' AND first_response_at IS NULL;
```

### 3.3 Particionamento (futuro)

Para volumes altos em `messages` (> 1M linhas):

```sql
-- Particionamento por mês
CREATE TABLE messages (
  ...
) PARTITION BY RANGE (timestamp);

CREATE TABLE messages_2025_02 PARTITION OF messages
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
```

---

## 4. Padrões de arquitetura

### 4.1 Padrão atual: monolito transacional

O BeaZap hoje segue um modelo **monolítico transacional** com:

- Ingestão via webhooks (tempo real)
- Processamento em background tasks
- Consultas diretas no banco transacional

### 4.2 Evolução sugerida: Lambda simplificado

Para cenários com necessidade de analytics mais pesados:

| Camada      | Função                         | Tecnologia sugerida      |
|-------------|--------------------------------|---------------------------|
| Ingestão    | Webhooks → fila                | Redis/RabbitMQ            |
| Processamento | Consumir fila, enriquecer    | Worker (Celery/RQ)        |
| Transacional | Dados operacionais             | PostgreSQL                |
| Analytics   | Agregações pré-calculadas      | Materialized views / cache |

### 4.3 Medallion (se houver data lake)

Se no futuro houver ingestão em data lake:

- **Bronze**: payload bruto dos webhooks
- **Silver**: conversas e mensagens normalizadas
- **Gold**: métricas agregadas (volume diário, SLA, etc.)

---

## 5. Otimizações imediatas

### 5.1 Queries

1. **get_hourly_volume**: trocar agregação em memória por `GROUP BY` no banco:

```python
# Em vez de carregar todas as mensagens
db.query(func.count(Message.id), func.extract('hour', Message.timestamp))
  .filter(Message.timestamp >= start)
  .group_by(func.extract('hour', Message.timestamp))
```

2. **Paginação**: aplicar em todas as listagens (conversas, mensagens, grupos)
3. **Cache**: Redis para métricas de overview (TTL 60–120s)

### 5.2 Connection pooling

```python
# database.py
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)
```

### 5.3 Migrações

- Migrar de `run_migrations()` manual para **Alembic**
- Versionar alterações de schema
- Facilitar rollback e deploys

---

## 6. Governança e qualidade

### 6.1 Dados sensíveis

- `contact_phone`, `content` (mensagens): considerar mascaramento em logs
- `api_key`: nunca em logs; usar variáveis de ambiente
- LGPD: definir política de retenção e anonimização

### 6.2 Retenção

- **messages**: retenção configurável (ex.: 12–24 meses)
- **conversations**: manter enquanto houver mensagens relacionadas
- Arquivar dados antigos em tabelas/cold storage

### 6.3 Qualidade

- `evolution_id`: garantir unicidade para evitar duplicatas
- `contact_phone`: normalizar formato (código país + DDD + número)
- Validação de `instance_id` em todas as queries multi-tenant

---

## 7. Resumo executivo

| Área           | Prioridade | Ação                                                |
|----------------|------------|-----------------------------------------------------|
| Banco produção | Alta       | Usar PostgreSQL com connection pooling             |
| Índices        | Alta       | Criar índices compostos recomendados               |
| get_hourly_volume | Alta   | Agregação no banco em vez de em memória             |
| Migrações      | Média      | Adotar Alembic                                     |
| Cache          | Média      | Redis para métricas de overview                    |
| Particionamento| Baixa      | Avaliar quando messages > 1M                        |
| Lambda/Medallion | Baixa   | Avaliar se analytics evoluir significativamente    |

---

*Documento gerado com base no skill data-architect e na análise do codebase BeaZap.*
