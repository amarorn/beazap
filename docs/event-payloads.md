# Exemplos de payloads de eventos

## wa.raw-events

```json
{
  "provider": "wppconnect",
  "tenant_id": "1",
  "connection_id": "3",
  "event_key": "true_5511999999999@c.us_ABC123",
  "payload": {
    "event": "onmessage",
    "session": "default",
    "body": {
      "id": "true_5511999999999@c.us_ABC123",
      "from": "5511999999999@s.whatsapp.net",
      "body": "Olá",
      "fromMe": false,
      "isGroupMsg": false
    }
  },
  "occurred_at": "2025-03-10T12:00:00.000Z"
}
```

## wa.normalized-events (message.received)

```json
{
  "event_type": "message.received",
  "tenant_id": "1",
  "connection_id": "3",
  "conversation_id": 42,
  "contact_id": 10,
  "message_id": 100,
  "direction": "inbound",
  "text": "Olá",
  "content_type": "text",
  "occurred_at": "2025-03-10T12:00:01.000Z"
}
```

## message.outbound.requested

```json
{
  "message_id": 101,
  "tenant_id": "1",
  "connection_id": "3",
  "phone_number": "5511999999999",
  "text": "Resposta automática",
  "requested_at": "2025-03-10T12:00:02.000Z"
}
```

## message.outbound.sent

```json
{
  "message_id": 101,
  "tenant_id": "1",
  "connection_id": "3",
  "provider_message_id": "true_5511999999999@c.us_XYZ789",
  "sent_at": "2025-03-10T12:00:03.000Z"
}
```

## message.outbound.failed

```json
{
  "message_id": 101,
  "tenant_id": "1",
  "connection_id": "3",
  "error": "Connection not found",
  "failed_at": "2025-03-10T12:00:03.000Z"
}
```
