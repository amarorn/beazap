# Resumo da sessão — BeaZap + WPPConnect QR Code

Uso **direto pela API** (curl, token, start-session, qrcode-session): **[WPPCONNECT_API.md](./WPPCONNECT_API.md)**.

## Problema inicial

O QR code para conectar o WhatsApp via WPPConnect não estava sendo gerado/exibido no painel de Settings.

## Bugs encontrados e corrigidos

### Bug 1 — `app/routers/webhook.py` (crítico)

- **Problema:** O WPPConnect Server envia o evento de QR como `qrcode`, mas o código só verificava `qr` e `qrUrl`. O QR era descartado e nunca armazenado no cache em memória (`_qr_store`).
- **Fix:** Adicionado `qrcode`, `QRCODE_UPDATED`, `onqrcode` na verificação. Também corrigida a extração quando o campo `data` é um dict aninhado (formato WPPConnect: `{"data": {"base64Image": "..."}}`).

### Bug 2 — `app/modules/providers/wppconnect.py` (crítico)

- **Problema:** `WppConnectProvider.connect()` chamava `GET /api/{session}/getQrCode` — endpoint que não existe no WPPConnect Server. Também não chamava `start-session` antes de pedir o QR.
- **Fix:** Trocado para o endpoint correto `/qrcode-session`. Adicionado `POST start-session` com `{"waitForLogin": False}` + `asyncio.sleep(3)` antes de buscar o QR. Adicionado import `asyncio`.

### Bug 3 — `app/services/wppconnect_service.py` (crítico)

- **Problema:** `get_qrcode()` chamava `start-session` e imediatamente tentava `qrcode-session` sem qualquer delay — o Chromium do WPPConnect precisa de 3–15s para inicializar e gerar o QR.
- **Fix:** Adicionado `{"waitForLogin": False}` no body do `start-session`. Retry com sleep entre tentativas.
- **INITIALIZING:** O WPPConnect pode responder HTTP 200 com `status: "INITIALIZING"` e `"QRCode is not available..."` por bastante tempo. O loop agora espera 5s apos `start-session`, depois ate 15 tentativas com 4s entre cada (~65s no total) enquanto vier INITIALIZING; so entao devolve 503 se ainda nao houver base64.

### Bug 4 — `frontend/components/dashboard/SlaAlertsWidget.tsx` (hydration)

- **Problema:** `useSlaThreshold` lia o `localStorage` direto no initializer do `useState`. O servidor renderizava 30 (padrão) e o cliente lia 15 do `localStorage`, causando Hydration mismatch no React.
- **Fix:** `useState(30)` fixo para SSR/hydration. A leitura do `localStorage` foi movida para dentro do `useEffect`, que só roda no client após a hidratação.

## Causa raiz do 503 restante

O backend retorna 503 para o QR porque o container Docker do WPPConnect não estava rodando. Comando para subir:

```bash
docker compose up -d postgres wppconnect
```

## Ponto de atenção — webhook `default` vs Instance name

No `docker-compose.yml` o `WEBHOOK_GLOBAL_URL` aponta para `/webhook/default`. Se a instância no painel tiver `instance_name` = `teste`, o QR era gravado só em `_qr_store["default"]` e o `get_qrcode` lia `_qr_store["teste"]` → 503.

**Correção aplicada:**

1. **Webhook** — Ao receber QR, grava também sob `session` / `instance` / `instanceName` do body (e dentro de `data`), além do path.
2. **get_qrcode** — Se não houver cache para a sessão pedida, usa cache de `default` como fallback (um único WPPConnect com webhook global).
3. **503** — Mensagem de detalhe orienta container + alinhamento sessão/webhook.

Ainda assim, o mais seguro é: **Instance name (sessão) = `default`** ou alterar `WEBHOOK_GLOBAL_URL` para `/webhook/<mesmo_nome_da_sessao>` se o server permitir por sessão.

## close-session quebra e trava o browser (server 2.8.x)

Log `req.client.close is not a function` em `sessionController.js` ao chamar `POST .../close-session`. Depois disso o Puppeteer acusa **browser already running for userDataDir**. O BeaZap **nao** chama mais `close-session` automaticamente antes do `start-session`.

**Se aparecer "browser already running":**
- `docker compose restart wppconnect` (mata processo e libera lock), ou
- parar o container e remover a pasta da sessao dentro do volume `wppconnect_data` (ex.: `userDataDir/teste`) e subir de novo.

## Auto Close 60s continua (body ignorado pelo server-cli)

Se nos logs continua `Auto close configured to 60s`, o **server-cli** nao aplica `autoClose: 0` do POST (config compilada + sessao ja criada). Sem `close-session` utilizavel, a janela util e **curta** (~30s apos `wapi.js injected` ate `Page Closed`).

**Mitigacoes:**
1. **Webhook** — Com `WEBHOOK_GLOBAL_URL` correto, o servidor pode enviar o QR ao BeaZap **antes** do auto close; o cache `_qr_store` atende o GET sem depender do `qrcode-session` depois que a pagina fechou.
2. **Polling rapido** — `get_qrcode` faz ate 25 tentativas a cada **2s** (sem sleep inicial) para tentar pegar o base64 antes do browser fechar.
3. **Nova sessao limpa** — Parar container, apagar `userDataDir/<sessao>` no volume, subir de novo e **imediatamente** abrir Ver QR (ou confiar no webhook).

## Auto Close 60s (browser fecha antes de escanear) — tentativa via body

Nos logs do WPPConnect aparece `Auto close configured to 60s` e `Auto Close Called` — a pagina fecha sozinha e o QR some. Sessao ja criada ignora body novo no `start-session`; e preciso **fechar e recriar**.

- **`get_qrcode`** chama `close-session` quando a sessao **nao** esta `open`, espera 2s e depois `start-session` com `autoClose: 0` e `createOptions.autoClose: 0`.
- Aquecer sessoes no startup (**warm**) **nao** chama close-session para nao derrubar quem ja esta conectado.

## Puppeteer timeout / Error no open browser

`Timed out after 30000 ms while waiting for the WS endpoint` — Chromium nao subiu a tempo. Tente: `docker compose restart wppconnect`. Se persistir, pare o container, remova volume `wppconnect_data` (apaga sessoes) e suba de novo.

## Extensao Passbolt no DevTools

Requisicoes `chrome-extension://.../passbolt-iframe` vêm da **sua** aba no Chrome, nao do browser headless dentro do container. Nao afetam o WPPConnect em Docker; podem ignorar ou desativar a extensao na aba do BeaZap.

## 401 "Session and Token are correct"

O endpoint `generate-token` devolve `full` no formato `sessao:$2b$10$...`. O WPPConnect **nao** aceita esse valor inteiro no `Authorization: Bearer`; aceita **apenas** a parte do token (depois dos dois pontos). O `_headers()` em `wppconnect_service.py` normaliza: se houver `:` e `$2b$`, envia so o hash no Bearer.

## Subida automática da sessão (start-session)

Na subida da API (`main.py` lifespan), é disparada em background a função `warm_all_instances_sessions()`:
- Aguarda 2s e, para cada instância ativa com `api_url`/`api_key`, chama `POST .../start-session` com `waitForLogin: false`.
- Objetivo: Chromium do WPPConnect já inicializado antes do usuário abrir o QR, reduzindo 503/timeouts no primeiro clique.
- Idempotente: 409 (sessão já existe) é tratado como sucesso.

## Fluxo correto após os fixes

1. WPPConnect inicia sessão → gera QR → envia webhook `qrcode` para `/webhook/default` → backend armazena em `_qr_store["default"]`.
2. Usuário clica "Ver QR" → `GET /api/instances/{id}/qrcode` → verifica cache → **HIT** → retorna QR imediatamente.
3. Ou (cache vazio): `POST start-session` (`waitForLogin: false`) → tenta `qrcode-session` 3x com 3s de intervalo → retorna QR quando disponível.
