# WPPConnect Server API — uso direto (curl)

Base local: `http://localhost:21465`  
Swagger: `http://localhost:21465/api-docs`

Secret no compose: `SECRET_KEY` = mesmo valor que `WPPCONNECT_SECRET` no `.env` (ex.: `THISISMYSECURETOKEN`).

Substitua:
- `SESSAO` — nome da sessão (ex.: `teste`)
- `SECRET` — ex.: `THISISMYSECURETOKEN`

---

## 1. Gerar token (sem Bearer)

Só `POST` na URL; **não** enviar `Authorization`.

```bash
curl -s -X POST "http://localhost:21465/api/SESSAO/SECRET/generate-token"
```

Resposta esperada:

```json
{"status":"success","session":"teste","token":"$2b$10$...","full":"teste:$2b$10$..."}
```

Guarde **`token`** (só o hash) para o header. O campo **`full`** é `sessao:hash` — **não** use o `full` inteiro no Bearer (retorna 401).

---

## 2. Bearer correto

```http
Authorization: Bearer $2b$10$...
```

Ou seja: **apenas** o valor de `token`, não `teste:$2b$10$...`.

```bash
export TOKEN='$2b$10$...'   # colar o token da resposta acima
```

---

## 3. Subir sessão (Chromium + WhatsApp Web)

```bash
curl -s -w "\nHTTP:%{http_code}\n" -X POST "http://localhost:21465/api/SESSAO/start-session" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"waitForLogin":false,"autoClose":0,"createOptions":{"autoClose":0}}'
```

- **200/201** — ok  
- **409** — sessão já existe (browser pode já estar no ar)

---

## 4. Obter QR (polling)

Enquanto `status` for `INITIALIZING` ou mensagem "not available", repetir em loop. Quando vier `base64Image` (ou dentro de `qrcode`), é o PNG em base64.

### Comportamento observado (server 2.8.7)

Muitas vezes a sequencia e:

1. `start-session` responde `CLOSED`, `qrcode: null`.
2. `qrcode-session` fica varias vezes em **`INITIALIZING`** (~10–20 s no total).
3. Depois passa a **`CLOSED`** e nao volta — **auto close** fecha o browser antes do QR aparecer no JSON do `qrcode-session`.

Por isso:

- **Polling a cada 1 s** (nao 2 s) logo apos o `start-session` aumenta a chance de pegar `base64Image` na janela INITIALIZING.
- **Webhook** no BeaZap e a rota mais estavel: o servidor pode enviar o evento `qrcode` por POST antes do auto close; o painel usa cache.

### Loop recomendado (1 s)

```bash
curl -s -X POST "http://localhost:21465/api/SESSAO/start-session" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"waitForLogin":false}'
for i in $(seq 1 60); do
  R=$(curl -s "http://localhost:21465/api/SESSAO/qrcode-session" -H "Authorization: Bearer $TOKEN")
  echo "$R" | jq -e '.base64Image != null' >/dev/null 2>&1 && echo "$R" | jq -r '.base64Image' | base64 -d > qr.png && break
  echo "$R" | jq -e '.qrcode.base64Image != null' >/dev/null 2>&1 && echo "$R" | jq -r '.qrcode.base64Image' | base64 -d > qr.png && break
  echo "$R" | jq -c '{status,message}'
  sleep 1
done
```

```bash
curl -s "http://localhost:21465/api/SESSAO/qrcode-session" \
  -H "Authorization: Bearer $TOKEN"
```

Exemplo sem QR ainda:

```json
{"status":"INITIALIZING","message":"QRCode is not available...","session":"teste"}
```

Com QR (trecho):

```json
{"base64Image":"iVBORw0KGgo..."}
```

Decodificar PNG:

```bash
curl -s "http://localhost:21465/api/SESSAO/qrcode-session" -H "Authorization: Bearer $TOKEN" \
  | jq -r '.base64Image // .qrcode.base64Image // empty' | head -c 80
# se vier base64, pipe para base64 -d > qr.png
```

---

## 5. Estado da conexão

```bash
curl -s "http://localhost:21465/api/SESSAO/checkConnectionState" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 6. Encerrar sessão (cuidado no 2.8.x)

`close-session` em algumas versões quebra (`req.client.close is not a function`). Alternativa documentada no server:

```bash
curl -s -X POST "http://localhost:21465/api/SESSAO/logout-session" \
  -H "Authorization: Bearer $TOKEN"
```

Se travar "browser already running", **restart do container**:

```bash
docker compose restart wppconnect
```

---

## 7. Script mínimo (bash)

```bash
#!/usr/bin/env bash
BASE=http://localhost:21465
SESSAO=teste
SECRET=THISISMYSECURETOKEN

TOKEN=$(curl -s -X POST "$BASE/api/$SESSAO/$SECRET/generate-token" | jq -r '.token')
echo "Token obtido (Bearer so o hash)"

curl -s -X POST "$BASE/api/$SESSAO/start-session" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"waitForLogin":false}' | jq .

for i in $(seq 1 30); do
  R=$(curl -s "$BASE/api/$SESSAO/qrcode-session" -H "Authorization: Bearer $TOKEN")
  if echo "$R" | jq -e '.base64Image != null' >/dev/null 2>&1; then
    echo "$R" | jq -r '.base64Image' | base64 -d > qr.png
    echo "qr.png gerado"
    exit 0
  fi
  echo "tentativa $i: $(echo "$R" | jq -c '{status,message}')"
  sleep 2
done
echo "timeout sem QR"
```

---

## Referência no BeaZap

| Uso no código        | Endpoint / método                          |
|---------------------|---------------------------------------------|
| Token               | `POST /api/{session}/{secret}/generate-token` |
| Subir browser       | `POST /api/{session}/start-session`         |
| QR                  | `GET /api/{session}/qrcode-session`         |
| Conectado?          | `GET /api/{session}/checkConnectionState`   |
| Enviar texto        | `POST /api/{session}/send-message`          |

Implementação: `app/services/wppconnect_service.py`.
