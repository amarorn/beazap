# BeaZap - Monitoramento e Gestao de Grupos WhatsApp

## Documento Tecnico de Implementacao

**Versao:** 1.0
**Data:** 2026-03-09
**Escopo:** Novas features para gerenciamento e monitoramento de grupos

---

## 1. Estado Atual (Baseline)

### 1.1 Backend - O que ja existe

| Recurso | Endpoint | Servico |
|---|---|---|
| Listar grupos | `GET /api/metrics/groups` | `metrics_service.get_group_conversations()` |
| KPIs de grupo | `GET /api/metrics/groups/overview` | `metrics_service.get_group_overview_metrics()` |
| Config grupo (responsavel/gerente/tags) | `PATCH /api/metrics/groups/{id}/config` | `metrics_service.update_group_config()` |
| Mensagens do grupo | `GET /api/metrics/groups/{id}/messages` | `metrics_service.get_conversation_messages()` |
| Sincronizar nomes | `POST /api/metrics/groups/sync-names` | `metrics_service.sync_group_names()` |

### 1.2 Frontend - O que ja existe

| Pagina | Rota | Funcionalidade |
|---|---|---|
| Lista de Grupos | `/groups` | Tabela com avatar, tags, responsavel, gerente, contagem msgs, filtro por tag, KPIs, sync nomes |
| Detalhe do Grupo | `/groups/[id]` | Visualizacao read-only do chat com sender_name, separador por dia |

### 1.3 Modelo de Dados Existente

**Conversation** (`conversations` table):
- `is_group: bool` — distingue grupo de chat 1-a-1
- `contact_phone: str(30)` — JID normalizado (ex: `120363422691642549`)
- `contact_jid: str(80)` — remoteJid completo (ex: `120363422691642549@g.us`)
- `contact_name: str(150)` — nome do grupo
- `contact_avatar_url: str(500)` — foto do grupo
- `responsible_id: FK(attendants)` — agente responsavel pelo grupo
- `manager_id: FK(attendants)` — gerente/supervisor do grupo
- `group_tags: str(200)` — tags separadas por virgula

**Message** (`messages` table):
- `sender_phone: str(30)` — telefone de quem enviou (em grupos)
- `sender_name: str(150)` — pushName de quem enviou (em grupos)
- `direction: enum(inbound/outbound)` — inbound = outros; outbound = a instancia
- `msg_type: enum(text/image/video/audio/document/sticker/location/call/other)`
- `content: text` — conteudo textual
- `timestamp: datetime`

### 1.4 Limitacoes Atuais

1. **Metricas excluem grupos** — todos os endpoints de metricas filtram `is_group == False`
2. **Chat e read-only** — nao tem input de envio no detalhe do grupo
3. **Sem analise de participantes** — sender_phone/sender_name armazenados mas nao analisados
4. **Sem alertas** — nenhum alerta especifico para grupos
5. **Sem analise LLM** — analysis_service ignora grupos

---

## 2. Features Propostas

### Feature 1: Envio de Mensagens em Grupos

**Prioridade:** Alta
**Complexidade:** Baixa (infraestrutura ja existe)

#### 2.1.1 Backend

Nenhum novo endpoint necessario. O endpoint existente ja funciona:

```
POST /api/metrics/conversations/{conversation_id}/send
Body: { "text": "mensagem" }
```

O `send_message_to_conversation()` em `app/services/metrics_service.py` ja:
- Carrega a conversa com `joinedload(instance)`
- Usa `contact_jid` (que contem `120363...@g.us` para grupos)
- Envia via `POST {api_url}/message/sendText/{instance_name}`
- Salva no banco local

**Verificacao necessaria:** Confirmar que o payload `{"number": "120363...@g.us", "text": "..."}` funciona na Evolution API para grupos (ja deveria funcionar pois grupos tem `@g.us`).

#### 2.1.2 Frontend

**Arquivo:** `frontend/app/groups/[id]/page.tsx`

Modificacoes:
1. Adicionar estado `text` e `textareaRef`
2. Adicionar `sendMutation` (copiar padrao de `conversations/[id]/page.tsx`)
3. Adicionar input bar no final do chat (textarea + botao enviar)
4. Adicionar auto-scroll no envio

```tsx
// Estado
const [text, setText] = useState('')
const textareaRef = useRef<HTMLTextAreaElement>(null)

// Mutation
const sendMutation = useMutation({
  mutationFn: (t: string) => metricsApi.sendMessage(id, t),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['group-messages', id] })
    setText('')
  },
})

// JSX — adicionar apos o card de chat
<div className="flex items-end gap-2 p-3 border-t">
  <textarea
    ref={textareaRef}
    value={text}
    onChange={e => setText(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
    placeholder="Mensagem para o grupo..."
    rows={1}
    className="flex-1 resize-none ..."
  />
  <button onClick={handleSend} disabled={!text.trim() || sendMutation.isPending}>
    <Send className="w-4 h-4" />
  </button>
</div>
```

**Quick Replies:** Reutilizar o componente de quick replies ja existente em conversations.

---

### Feature 2: Dashboard de Metricas por Grupo

**Prioridade:** Alta
**Complexidade:** Media

#### 2.2.1 Backend — Novos Endpoints

**Arquivo:** `app/routers/metrics.py`
**Servico:** `app/services/metrics_service.py`

##### Endpoint 1: Volume Diario por Grupo

```
GET /api/metrics/groups/daily-volume?instance_id=X&days=14
```

**Response:**
```json
[
  {
    "date": "2026-03-09",
    "total_messages": 142,
    "inbound": 98,
    "outbound": 44,
    "active_groups": 8
  }
]
```

**SQL logica:**
```python
def get_group_daily_volume(db: Session, instance_id: int = None, days: int = 14):
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    result = []
    for i in range(days - 1, -1, -1):
        day_start = today - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        base = db.query(Message).join(Conversation).filter(
            Conversation.is_group == True,
            Message.timestamp >= day_start,
            Message.timestamp < day_end,
        )
        if instance_id:
            base = base.filter(Conversation.instance_id == instance_id)
        inbound = base.filter(Message.direction == MessageDirection.inbound).count()
        outbound = base.filter(Message.direction == MessageDirection.outbound).count()
        active = db.query(func.count(func.distinct(Conversation.id))).join(Message).filter(
            Conversation.is_group == True,
            Message.timestamp >= day_start,
            Message.timestamp < day_end,
        ).scalar() or 0
        result.append({
            "date": day_start.strftime("%Y-%m-%d"),
            "total_messages": inbound + outbound,
            "inbound": inbound,
            "outbound": outbound,
            "active_groups": active,
        })
    return result
```

##### Endpoint 2: Horario de Pico por Grupo

```
GET /api/metrics/groups/hourly-volume?instance_id=X&days=7
```

**Response:**
```json
[
  { "hour": 0, "count": 5, "label": "00h" },
  { "hour": 1, "count": 2, "label": "01h" },
  ...
]
```

Logica identica ao `get_hourly_volume()` existente, mas filtrando `is_group == True`.

##### Endpoint 3: Ranking de Grupos Mais Ativos

```
GET /api/metrics/groups/ranking?instance_id=X&days=7&limit=10
```

**Response:**
```json
[
  {
    "group_id": 5,
    "group_name": "Vendas SP",
    "total_messages": 342,
    "inbound": 220,
    "outbound": 122,
    "unique_participants": 12,
    "responsible_name": "Joao"
  }
]
```

**SQL logica:**
```python
def get_group_ranking(db, instance_id=None, days=7, limit=10):
    since = datetime.utcnow() - timedelta(days=days)
    query = (
        db.query(
            Conversation.id,
            Conversation.contact_name,
            func.count(Message.id).label('total'),
            func.count(func.distinct(Message.sender_phone)).label('participants'),
        )
        .join(Message)
        .filter(Conversation.is_group == True, Message.timestamp >= since)
        .group_by(Conversation.id)
        .order_by(func.count(Message.id).desc())
        .limit(limit)
    )
    ...
```

#### 2.2.2 Frontend — Nova Aba/Secao no Dashboard de Grupos

**Arquivo:** `frontend/app/groups/page.tsx` (expandir) ou criar `frontend/app/groups/dashboard/page.tsx`

Componentes:
1. **Grafico de Volume Diario** — reutilizar `VolumeChart` (Recharts BarChart) com dados de grupo
2. **Grafico de Horario de Pico** — reutilizar `HourlyVolumeChart` existente
3. **Tabela de Ranking** — top 10 grupos mais ativos com barras de progresso

**Schemas Pydantic (adicionar em `app/schemas/metrics.py`):**
```python
class GroupDailyVolume(BaseModel):
    date: str
    total_messages: int
    inbound: int
    outbound: int
    active_groups: int

class GroupRanking(BaseModel):
    group_id: int
    group_name: Optional[str]
    total_messages: int
    inbound: int
    outbound: int
    unique_participants: int
    responsible_name: Optional[str]
```

**API Client (adicionar em `frontend/lib/api.ts`):**
```ts
// Dentro de metricsApi
getGroupDailyVolume: (params?: { instance_id?: number; days?: number }) =>
  api.get<GroupDailyVolume[]>('/api/metrics/groups/daily-volume', { params }).then(r => r.data),

getGroupHourlyVolume: (params?: { instance_id?: number; days?: number }) =>
  api.get<HourlyVolume[]>('/api/metrics/groups/hourly-volume', { params }).then(r => r.data),

getGroupRanking: (params?: { instance_id?: number; days?: number; limit?: number }) =>
  api.get<GroupRanking[]>('/api/metrics/groups/ranking', { params }).then(r => r.data),
```

---

### Feature 3: Analise de Participantes

**Prioridade:** Alta
**Complexidade:** Media

#### 2.3.1 Backend — Novos Endpoints

##### Endpoint 1: Participantes de um Grupo

```
GET /api/metrics/groups/{group_id}/participants?days=30
```

**Response:**
```json
{
  "participants": [
    {
      "phone": "5584999999999",
      "name": "Joao Silva",
      "total_messages": 85,
      "last_message_at": "2026-03-09T15:30:00",
      "first_message_at": "2026-02-10T08:00:00",
      "avg_messages_per_day": 2.8,
      "media_count": 5,
      "is_team_member": true
    }
  ],
  "total_participants": 15,
  "team_members": 3,
  "external_participants": 12
}
```

**SQL logica:**
```python
def get_group_participants(db: Session, group_id: int, days: int = 30):
    since = datetime.utcnow() - timedelta(days=days)
    # Buscar mensagens com sender_phone agrupadas
    rows = (
        db.query(
            Message.sender_phone,
            Message.sender_name,
            func.count(Message.id).label('total'),
            func.max(Message.timestamp).label('last_at'),
            func.min(Message.timestamp).label('first_at'),
        )
        .filter(
            Message.conversation_id == group_id,
            Message.sender_phone.isnot(None),
            Message.timestamp >= since,
        )
        .group_by(Message.sender_phone, Message.sender_name)
        .order_by(func.count(Message.id).desc())
        .all()
    )
    # Tambem incluir outbound (da instancia — sender_phone=None, direction=outbound)
    outbound_count = db.query(func.count(Message.id)).filter(
        Message.conversation_id == group_id,
        Message.direction == MessageDirection.outbound,
        Message.timestamp >= since,
    ).scalar() or 0
    # Cruzar sender_phone com attendants para marcar is_team_member
    attendant_phones = {a.phone for a in db.query(Attendant).filter(Attendant.active == True).all()}
    participants = []
    for row in rows:
        participants.append({
            "phone": row.sender_phone,
            "name": row.sender_name,
            "total_messages": row.total,
            "last_message_at": row.last_at.isoformat(),
            "first_message_at": row.first_at.isoformat(),
            "is_team_member": row.sender_phone in attendant_phones,
        })
    return {"participants": participants, "total_participants": len(participants), ...}
```

##### Endpoint 2: Tempo de Resposta da Equipe no Grupo

```
GET /api/metrics/groups/{group_id}/response-time?days=7
```

**Response:**
```json
{
  "avg_response_seconds": 180,
  "median_response_seconds": 120,
  "max_response_seconds": 900,
  "responses_within_5min": 85,
  "responses_within_15min": 95,
  "unanswered_count": 3,
  "by_team_member": [
    {
      "phone": "5584999999999",
      "name": "Joao",
      "avg_response_seconds": 120,
      "total_responses": 15
    }
  ]
}
```

**Logica:** Para cada mensagem inbound de um participante externo (nao-equipe), encontrar a proxima mensagem outbound ou de um membro da equipe. A diferenca de timestamps e o tempo de resposta.

```python
def get_group_response_time(db: Session, group_id: int, days: int = 7):
    since = datetime.utcnow() - timedelta(days=days)
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == group_id, Message.timestamp >= since)
        .order_by(Message.timestamp.asc())
        .all()
    )
    attendant_phones = {a.phone for a in db.query(Attendant).filter(Attendant.active == True).all()}
    response_times = []
    pending_question = None
    for msg in messages:
        is_team = (msg.direction == MessageDirection.outbound) or (msg.sender_phone in attendant_phones)
        if not is_team and msg.content:
            # Mensagem de cliente/externo
            pending_question = msg
        elif is_team and pending_question:
            # Resposta da equipe
            delta = (msg.timestamp - pending_question.timestamp).total_seconds()
            response_times.append({"seconds": delta, "responder": msg.sender_phone or "instance"})
            pending_question = None
    # Calcular avg, median, etc.
    ...
```

#### 2.3.2 Frontend — Painel de Participantes

**Arquivo:** Expandir `frontend/app/groups/[id]/page.tsx`

Adicionar aba "Participantes" ao detalhe do grupo:
- Tabela com ranking de participantes (avatar com iniciais, nome, total msgs, barra de progresso relativa)
- Badge "Equipe" vs "Externo" para cada participante
- Card com tempo medio de resposta da equipe
- Indicador de membros inativos (sem msg ha >7 dias)

**Componentes visuais:**
```tsx
// Barra de atividade relativa
<div className="w-24 bg-zinc-100 dark:bg-zinc-700 rounded-full h-2">
  <div
    className="bg-emerald-500 h-2 rounded-full"
    style={{ width: `${(participant.total / maxMessages) * 100}%` }}
  />
</div>
```

---

### Feature 4: Alertas de Grupo

**Prioridade:** Media
**Complexidade:** Media

#### 2.4.1 Backend — Novo Endpoint

**Arquivo:** `app/services/metrics_service.py` e `app/routers/metrics.py`

```
GET /api/metrics/groups/alerts?instance_id=X
```

**Response:**
```json
{
  "alerts": [
    {
      "type": "unanswered",
      "group_id": 5,
      "group_name": "Vendas SP",
      "message": "Mensagem de cliente ha 45min sem resposta",
      "severity": "warning",
      "since": "2026-03-09T14:30:00",
      "last_external_message": "Alguem pode me ajudar com o pedido?"
    },
    {
      "type": "inactive",
      "group_id": 12,
      "group_name": "Suporte Tecnico",
      "message": "Sem mensagens ha 3 dias",
      "severity": "info",
      "since": "2026-03-06T18:00:00"
    },
    {
      "type": "spike",
      "group_id": 8,
      "group_name": "Reclamacoes",
      "message": "Volume 3x acima da media (45 msgs na ultima hora)",
      "severity": "critical",
      "current_rate": 45,
      "avg_rate": 15
    }
  ]
}
```

**Logica:**

```python
def get_group_alerts(db: Session, instance_id: int = None):
    alerts = []
    now = datetime.utcnow()
    groups = db.query(Conversation).filter(Conversation.is_group == True)
    if instance_id:
        groups = groups.filter(Conversation.instance_id == instance_id)
    groups = groups.all()

    attendant_phones = {a.phone for a in db.query(Attendant).filter(Attendant.active == True).all()}
    threshold_minutes = 30  # configuravel

    for g in groups:
        # ALERTA 1: Grupo sem resposta
        last_msgs = (
            db.query(Message)
            .filter(Message.conversation_id == g.id)
            .order_by(Message.timestamp.desc())
            .limit(5)
            .all()
        )
        if last_msgs:
            last_msg = last_msgs[0]
            is_external = (
                last_msg.direction == MessageDirection.inbound
                and last_msg.sender_phone not in attendant_phones
            )
            if is_external:
                delta_min = (now - last_msg.timestamp).total_seconds() / 60
                if delta_min >= threshold_minutes:
                    alerts.append({
                        "type": "unanswered",
                        "group_id": g.id,
                        "group_name": g.contact_name,
                        "severity": "critical" if delta_min > 60 else "warning",
                        "since": last_msg.timestamp.isoformat(),
                        "minutes_waiting": round(delta_min),
                        "last_external_message": (last_msg.content or "")[:100],
                    })

        # ALERTA 2: Grupo inativo
        if g.last_message_at:
            inactive_days = (now - g.last_message_at).days
            if inactive_days >= 3:
                alerts.append({
                    "type": "inactive",
                    "group_id": g.id,
                    "group_name": g.contact_name,
                    "severity": "info",
                    "since": g.last_message_at.isoformat(),
                    "days_inactive": inactive_days,
                })

        # ALERTA 3: Pico de volume
        one_hour_ago = now - timedelta(hours=1)
        msgs_last_hour = db.query(func.count(Message.id)).filter(
            Message.conversation_id == g.id,
            Message.timestamp >= one_hour_ago,
        ).scalar() or 0
        # Media historica: msgs/hora nos ultimos 7 dias
        seven_days_ago = now - timedelta(days=7)
        total_7d = db.query(func.count(Message.id)).filter(
            Message.conversation_id == g.id,
            Message.timestamp >= seven_days_ago,
        ).scalar() or 0
        avg_per_hour = total_7d / (7 * 24) if total_7d else 0
        if avg_per_hour > 0 and msgs_last_hour > avg_per_hour * 3 and msgs_last_hour > 10:
            alerts.append({
                "type": "spike",
                "group_id": g.id,
                "group_name": g.contact_name,
                "severity": "critical",
                "current_rate": msgs_last_hour,
                "avg_rate": round(avg_per_hour, 1),
            })

    # Ordenar por severidade
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: severity_order.get(a["severity"], 9))
    return {"alerts": alerts}
```

#### 2.4.2 Frontend — Widget de Alertas

**Opcao A:** Badge na Sidebar (como SLA alerts)
**Opcao B:** Card de alertas no topo da pagina `/groups`

```tsx
// Card de alerta individual
<div className={`p-3 rounded-lg border-l-4 ${
  alert.severity === 'critical' ? 'border-red-500 bg-red-50 dark:bg-red-900/10' :
  alert.severity === 'warning' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/10' :
  'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
}`}>
  <p className="text-sm font-medium">{alert.group_name}</p>
  <p className="text-xs text-zinc-500">{alert.message}</p>
</div>
```

---

### Feature 5: Analise LLM de Grupos

**Prioridade:** Media
**Complexidade:** Alta

#### 2.5.1 Backend — Novo Servico

**Novo arquivo:** `app/services/group_analysis_service.py`

##### Funcao 1: Resumo Diario do Grupo

```python
def generate_group_daily_summary(group_id: int, date: str = None):
    """Gera resumo do dia via LLM."""
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(
            Conversation.id == group_id,
            Conversation.is_group == True,
        ).first()
        if not conv:
            return None

        target_date = datetime.strptime(date, "%Y-%m-%d") if date else datetime.utcnow()
        day_start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        messages = db.query(Message).filter(
            Message.conversation_id == group_id,
            Message.timestamp >= day_start,
            Message.timestamp < day_end,
            Message.content.isnot(None),
        ).order_by(Message.timestamp.asc()).all()

        if len(messages) < 3:
            return {"summary": "Poucas mensagens para gerar resumo.", "topics": []}

        # Montar transcript
        transcript = []
        for m in messages:
            sender = m.sender_name or m.sender_phone or ("Equipe" if m.direction.value == "outbound" else "Desconhecido")
            transcript.append(f"[{m.timestamp.strftime('%H:%M')}] {sender}: {m.content[:200]}")

        prompt = f"""Analise a conversa abaixo de um grupo WhatsApp chamado "{conv.contact_name or 'Grupo'}" do dia {day_start.strftime('%d/%m/%Y')}.

Retorne um JSON com:
- "resumo": texto de 2-4 frases resumindo o que foi discutido
- "topicos": lista de strings com os principais topicos abordados (max 5)
- "sentimento_geral": "positivo", "neutro" ou "negativo"
- "pendencias": lista de strings com perguntas/solicitacoes que ficaram sem resposta
- "destaques": lista de decisoes ou informacoes importantes mencionadas

Conversa:
{chr(10).join(transcript[-100:])}"""  # Limitar a 100 msgs

        # Chamar LLM (usar padrao do analysis_service.py)
        result = _call_llm(prompt)
        return result
    finally:
        db.close()
```

##### Funcao 2: Deteccao de Topicos

Reutilizar o `trends_anomalies_service.py` (Topicos Emergentes) mas filtrando por grupos.

##### Funcao 3: Sentimento por Participante

```python
def analyze_group_sentiment(group_id: int, days: int = 7):
    """Analisa sentimento medio por participante."""
    # Agrupar mensagens por sender_phone
    # Para cada participante, enviar batch de mensagens para LLM
    # Retornar: [{ phone, name, sentiment, sample_messages }]
```

#### 2.5.2 Endpoints

```
POST /api/metrics/groups/{group_id}/analyze-day?date=2026-03-09
POST /api/metrics/groups/{group_id}/analyze-sentiment?days=7
GET  /api/metrics/groups/{group_id}/summaries?days=7
```

#### 2.5.3 Modelo de Dados — Nova Tabela

```python
class GroupDailySummary(Base):
    __tablename__ = "group_daily_summaries"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    date = Column(Date, nullable=False)
    summary = Column(Text)
    topics = Column(Text)          # JSON array serializado
    sentiment = Column(String(20))  # positivo/neutro/negativo
    pending_items = Column(Text)    # JSON array
    highlights = Column(Text)       # JSON array
    message_count = Column(Integer)
    participant_count = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation")
```

**Migracao:**
```python
# Em app/core/database.py run_migrations()
f"ALTER TABLE ... (nao necessario, create_all cria tabelas novas)"
```
Basta importar o modelo em `init_db()`.

#### 2.5.4 Frontend — Aba Resumos no Detalhe do Grupo

Adicionar aba "Resumos IA" em `/groups/[id]`:
- Lista de resumos diarios (cards por dia)
- Botao "Gerar Resumo de Hoje" (on-demand, `useMutation`)
- Topicos como badges coloridos
- Pendencias como checklist
- Sentimento com indicador visual (verde/amarelo/vermelho)

---

### Feature 6: Metricas de Performance do Responsavel por Grupo

**Prioridade:** Baixa
**Complexidade:** Media

#### 2.6.1 Backend

```
GET /api/metrics/groups/{group_id}/responsible-performance?days=30
```

**Response:**
```json
{
  "responsible_name": "Joao",
  "metrics": {
    "total_messages_sent": 45,
    "avg_response_time_seconds": 180,
    "participation_rate": 0.35,
    "days_active": 25,
    "days_inactive": 5,
    "first_response_of_day_avg_seconds": 600
  }
}
```

---

## 3. Plano de Implementacao

### Fase 1 — Quick Wins (1-2 dias)

| # | Feature | Esforco |
|---|---|---|
| 1.1 | Envio de mensagens em grupos (frontend) | 2h |
| 1.2 | Quick replies no chat de grupo | 1h |

### Fase 2 — Dashboard de Grupos (2-3 dias)

| # | Feature | Esforco |
|---|---|---|
| 2.1 | Endpoint volume diario de grupos | 2h |
| 2.2 | Endpoint horario de pico de grupos | 1h |
| 2.3 | Endpoint ranking de grupos | 2h |
| 2.4 | Frontend: graficos e ranking | 4h |

### Fase 3 — Participantes (2-3 dias)

| # | Feature | Esforco |
|---|---|---|
| 3.1 | Endpoint participantes do grupo | 3h |
| 3.2 | Endpoint tempo de resposta da equipe | 3h |
| 3.3 | Frontend: painel de participantes | 4h |

### Fase 4 — Alertas (1-2 dias)

| # | Feature | Esforco |
|---|---|---|
| 4.1 | Endpoint de alertas de grupo | 3h |
| 4.2 | Frontend: widget de alertas + badge sidebar | 2h |

### Fase 5 — Analise LLM (3-4 dias)

| # | Feature | Esforco |
|---|---|---|
| 5.1 | Modelo GroupDailySummary + migracao | 1h |
| 5.2 | Servico de resumo diario (LLM) | 4h |
| 5.3 | Servico de sentimento por participante | 3h |
| 5.4 | Endpoints + frontend | 4h |

---

## 4. Estrutura de Arquivos (Novos/Modificados)

```
app/
  models/
    group_summary.py              # NOVO — GroupDailySummary model
  schemas/
    metrics.py                    # MODIFICAR — adicionar schemas de grupo
  services/
    metrics_service.py            # MODIFICAR — novos metodos de grupo
    group_analysis_service.py     # NOVO — analise LLM de grupos
  routers/
    metrics.py                    # MODIFICAR — novos endpoints
  core/
    database.py                   # MODIFICAR — importar novo modelo + migracao

frontend/
  types/index.ts                  # MODIFICAR — novos tipos
  lib/api.ts                      # MODIFICAR — novos metodos API
  app/groups/
    page.tsx                      # MODIFICAR — adicionar dashboard/alertas
    [id]/page.tsx                 # MODIFICAR — envio + participantes + resumos
    dashboard/page.tsx            # NOVO (opcional) — dashboard dedicado
```

---

## 5. Tipos TypeScript (Novos)

```ts
// frontend/types/index.ts

export interface GroupDailyVolume {
  date: string
  total_messages: number
  inbound: number
  outbound: number
  active_groups: number
}

export interface GroupRanking {
  group_id: number
  group_name: string | null
  total_messages: number
  inbound: number
  outbound: number
  unique_participants: number
  responsible_name: string | null
}

export interface GroupParticipant {
  phone: string
  name: string | null
  total_messages: number
  last_message_at: string
  first_message_at: string
  avg_messages_per_day: number
  media_count: number
  is_team_member: boolean
}

export interface GroupParticipantsResponse {
  participants: GroupParticipant[]
  total_participants: number
  team_members: number
  external_participants: number
}

export interface GroupResponseTime {
  avg_response_seconds: number
  median_response_seconds: number
  max_response_seconds: number
  responses_within_5min: number
  responses_within_15min: number
  unanswered_count: number
  by_team_member: {
    phone: string
    name: string | null
    avg_response_seconds: number
    total_responses: number
  }[]
}

export interface GroupAlert {
  type: 'unanswered' | 'inactive' | 'spike'
  group_id: number
  group_name: string | null
  severity: 'critical' | 'warning' | 'info'
  since?: string
  minutes_waiting?: number
  days_inactive?: number
  current_rate?: number
  avg_rate?: number
  last_external_message?: string
}

export interface GroupDailySummary {
  id: number
  date: string
  summary: string
  topics: string[]
  sentiment: 'positivo' | 'neutro' | 'negativo'
  pending_items: string[]
  highlights: string[]
  message_count: number
  participant_count: number
  created_at: string
}
```

---

## 6. Dependencias

Nenhuma nova dependencia necessaria. Tudo usa:
- SQLAlchemy (queries)
- Pydantic (schemas)
- httpx (Evolution API)
- Anthropic/OpenAI SDK (LLM — ja configurado)
- Recharts (graficos — ja instalado)
- TanStack Query (data fetching — ja instalado)
- shadcn/ui (componentes — ja instalado)

---

## 7. Consideracoes

### Performance
- Queries de participantes e response-time iteram mensagens do grupo. Para grupos com 10k+ msgs, indexar `messages.conversation_id + messages.timestamp` (ja existe).
- Resumo LLM: limitar a 100 ultimas mensagens do dia para nao estourar token limit.
- Cache: considerar cache de 5min para endpoints de ranking e volume diario.

### Seguranca
- Envio de mensagens em grupos passa pelo mesmo `send_message_to_conversation()` que ja valida instancia e conectividade.
- Analise LLM nao expoe dados sensiveis — so processa conteudo de mensagens ja armazenadas.

### Webhook
- Mensagens de grupo ja sao processadas por `process_message_upsert()` com `sender_phone` e `sender_name`.
- O webhook `groups.upsert` ja atualiza nomes/avatares via `process_groups_upsert()`.
- Nenhuma mudanca no webhook necessaria.
