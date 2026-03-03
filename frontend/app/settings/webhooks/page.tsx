'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { instancesApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Webhook, Globe, CheckCircle2 } from 'lucide-react'

export default function WebhooksPage() {
  const [serverUrl, setServerUrl] = useState('')
  const [webhookStatus, setWebhookStatus] = useState<Record<number, { ok: boolean; url?: string; error?: string }>>({})

  useEffect(() => {
    const stored = localStorage.getItem('webhook_server_url')
    if (stored) setServerUrl(stored)
  }, [])

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesApi.list,
  })

  const inputClass = "w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"

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
              Webhook: {serverUrl.replace(/\/$/, '')}/webhook/<span className="text-blue-500">{'{instance_name}'}</span>
            </p>
          )}
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
                disabled={!serverUrl}
                onClick={async () => {
                  for (const inst of instances) {
                    setWebhookStatus(s => ({ ...s, [inst.id]: { ok: false } }))
                    try {
                      const res = await instancesApi.configureWebhook(inst.id, serverUrl)
                      setWebhookStatus(s => ({ ...s, [inst.id]: { ok: true, url: res.webhook_url } }))
                    } catch (err: unknown) {
                      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erro'
                      setWebhookStatus(s => ({ ...s, [inst.id]: { ok: false, error: msg } }))
                    }
                  }
                }}
              >
                Configurar todas
              </Button>
            </div>
            {instances.map(inst => {
              const ws = webhookStatus[inst.id]
              return (
                <div key={inst.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{inst.name}</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono truncate">{inst.instance_name}</p>
                    {ws?.ok && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono truncate flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                        {ws.url}
                      </p>
                    )}
                    {ws?.error && (
                      <p className="text-[11px] text-red-500 dark:text-red-400 truncate mt-0.5">{ws.error}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={ws?.ok ? 'outline' : 'default'}
                    className={ws?.ok
                      ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex-shrink-0'
                      : 'bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0'
                    }
                    disabled={!serverUrl}
                    onClick={async () => {
                      setWebhookStatus(s => ({ ...s, [inst.id]: { ok: false } }))
                      try {
                        const res = await instancesApi.configureWebhook(inst.id, serverUrl)
                        setWebhookStatus(s => ({ ...s, [inst.id]: { ok: true, url: res.webhook_url } }))
                      } catch (err: unknown) {
                        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erro ao configurar'
                        setWebhookStatus(s => ({ ...s, [inst.id]: { ok: false, error: msg } }))
                      }
                    }}
                  >
                    {ws?.ok ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Configurado</> : 'Configurar'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        {/* Events info */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Eventos configurados automaticamente:</p>
          <div className="flex flex-wrap gap-1.5">
            {['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'GROUPS_UPSERT', 'GROUP_UPDATE', 'CALL'].map(ev => (
              <span key={ev} className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-mono font-medium border border-blue-100 dark:border-blue-900/40">
                {ev}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
