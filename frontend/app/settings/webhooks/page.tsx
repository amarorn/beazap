'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { instancesApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Webhook, Globe, CheckCircle2 } from 'lucide-react'

const WEBHOOK_EVENTS_ALL = [
  'APPLICATION_STARTUP',
  'CALL',
  'CHATS_DELETE',
  'CHATS_SET',
  'CHATS_UPDATE',
  'CHATS_UPSERT',
  'CONNECTION_UPDATE',
  'CONTACTS_SET',
  'CONTACTS_UPDATE',
  'CONTACTS_UPSERT',
  'GROUP_PARTICIPANTS_UPDATE',
  'GROUP_UPDATE',
  'GROUPS_UPSERT',
  'LABELS_ASSOCIATION',
  'LABELS_EDIT',
  'LOGOUT_INSTANCE',
  'MESSAGES_DELETE',
  'MESSAGES_SET',
  'MESSAGES_UPDATE',
  'MESSAGES_UPSERT',
  'PRESENCE_UPDATE',
  'QRCODE_UPDATED',
  'REMOVE_INSTANCE',
  'SEND_MESSAGE',
  'TYPEBOT_CHANGE_STATUS',
  'TYPEBOT_START',
]

const DEFAULT_EVENTS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'GROUPS_UPSERT',
  'GROUP_UPDATE',
  'GROUP_PARTICIPANTS_UPDATE',
  'CALL',
]

export default function WebhooksPage() {
  const [serverUrl, setServerUrl] = useState('')
  const [webhookByEvents, setWebhookByEvents] = useState(false)
  const [webhookBase64, setWebhookBase64] = useState(false)
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set(DEFAULT_EVENTS))
  const [webhookStatus, setWebhookStatus] = useState<
    Record<number, { ok: boolean; url?: string; error?: string }>
  >({})

  useEffect(() => {
    const stored = localStorage.getItem('webhook_server_url')
    if (stored) setServerUrl(stored)
  }, [])

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesApi.list,
  })

  const inputClass =
    'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500'

  const toggleEvent = (ev: string) => {
    setSelectedEvents(prev => {
      const next = new Set(prev)
      if (next.has(ev)) next.delete(ev)
      else next.add(ev)
      return next
    })
  }

  const markAll = () => setSelectedEvents(new Set(WEBHOOK_EVENTS_ALL))
  const unmarkAll = () => setSelectedEvents(new Set())

  const configure = async (inst: { id: number }) => {
    setWebhookStatus(s => ({ ...s, [inst.id]: { ok: false } }))
    try {
      const res = await instancesApi.configureWebhook(inst.id, {
        server_url: serverUrl,
        webhook_by_events: webhookByEvents,
        webhook_base64: webhookBase64,
        events: Array.from(selectedEvents),
      })
      setWebhookStatus(s => ({ ...s, [inst.id]: { ok: true, url: res.webhook_url } }))
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erro'
      setWebhookStatus(s => ({ ...s, [inst.id]: { ok: false, error: msg } }))
    }
  }

  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base dark:text-zinc-100 flex items-center gap-2">
          <Webhook className="w-4 h-4 text-blue-500" />
          Configurar Webhooks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Server URL */}
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            URL do BeaZap (porta 8000) onde a Evolution API enviará os eventos.
          </p>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="http://host.docker.internal:8000"
              value={serverUrl}
              onChange={e => {
                setServerUrl(e.target.value)
                localStorage.setItem('webhook_server_url', e.target.value)
              }}
              className={`${inputClass} pl-8`}
            />
          </div>
          {serverUrl && (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
              Webhook: {serverUrl.replace(/\/$/, '')}/webhook/
              <span className="text-blue-500">{'{instance_name}'}</span>
              {webhookByEvents && (
                <span className="text-zinc-500"> + /evento (ex: /messages-upsert)</span>
              )}
            </p>
          )}
        </div>

        {/* Webhook by Events */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={webhookByEvents}
              onChange={e => setWebhookByEvents(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">Webhook by Events</span>
          </label>
          <span className="text-[11px] text-zinc-500">
            Cria rota por evento (ex: /webhook/instance/messages-upsert)
          </span>
        </div>

        {/* Webhook Base64 */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={webhookBase64}
              onChange={e => setWebhookBase64(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">Webhook Base64</span>
          </label>
          <span className="text-[11px] text-zinc-500">Envia mídia em base64 no webhook</span>
        </div>

        {/* Events */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
              Eventos
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={markAll}>
                Marcar todos
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={unmarkAll}>
                Desmarcar todos
              </Button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 p-2.5 bg-zinc-50 dark:bg-zinc-800/50 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {WEBHOOK_EVENTS_ALL.map(ev => (
              <label
                key={ev}
                className="flex items-center gap-2 cursor-pointer text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 rounded px-2 py-1"
              >
                <input
                  type="checkbox"
                  checked={selectedEvents.has(ev)}
                  onChange={() => toggleEvent(ev)}
                  className="w-3.5 h-3.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-mono text-[11px] truncate">{ev}</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500">
            {selectedEvents.size} evento(s) selecionado(s)
          </p>
        </div>

        {/* Per-instance configure */}
        {instances.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                Instâncias
              </p>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={!serverUrl || selectedEvents.size === 0}
                onClick={() => instances.forEach(inst => configure(inst))}
              >
                Configurar todas
              </Button>
            </div>
            {instances.map(inst => {
              const ws = webhookStatus[inst.id]
              return (
                <div
                  key={inst.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {inst.name}
                    </p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono truncate">
                      {inst.instance_name}
                    </p>
                    {ws?.ok && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono truncate flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                        {ws.url}
                      </p>
                    )}
                    {ws?.error && (
                      <p className="text-[11px] text-red-500 dark:text-red-400 truncate mt-0.5">
                        {ws.error}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={ws?.ok ? 'outline' : 'default'}
                    className={
                      ws?.ok
                        ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex-shrink-0'
                        : 'bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0'
                    }
                    disabled={!serverUrl || selectedEvents.size === 0}
                    onClick={() => configure(inst)}
                  >
                    {ws?.ok ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Configurado
                      </>
                    ) : (
                      'Configurar'
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
