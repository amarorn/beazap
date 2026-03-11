'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { instancesApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Webhook, Copy, Check } from 'lucide-react'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback silencioso
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar URL"
      className="flex-shrink-0 p-1.5 rounded-md text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  )
}

export default function WebhooksPage() {
  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesApi.list,
  })

  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base dark:text-zinc-100 flex items-center gap-2">
          <Webhook className="w-4 h-4 text-blue-500" />
          Webhooks (open-wa)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-3 space-y-2">
          <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
            O open-wa configura o webhook via variavel de ambiente
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            O webhook e definido pela variavel <code className="font-mono bg-blue-100 dark:bg-blue-900/30 px-1 rounded">WA_AUTOMATE_WEBHOOK</code> no{' '}
            <code className="font-mono bg-blue-100 dark:bg-blue-900/30 px-1 rounded">docker-compose.yml</code>. Altere a URL e reinicie o container.
          </p>
        </div>

        {instances.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
              URLs de Webhook por Instancia
            </p>
            {instances.map(inst => {
              const webhookUrl = `http://host.docker.internal:8000/webhook/${inst.instance_name}`
              return (
                <div
                  key={inst.id}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2.5 space-y-1.5"
                >
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {inst.name}
                    <span className="ml-1.5 text-[10px] opacity-70 font-mono">{inst.instance_name}</span>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      readOnly
                      value={webhookUrl}
                      className="flex-1 text-[11px] font-mono border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 focus:outline-none cursor-text select-all"
                    />
                    <CopyButton text={webhookUrl} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {instances.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-2">
            Nenhuma instancia cadastrada. Adicione uma em{' '}
            <a href="/settings" className="text-blue-500 hover:underline">Instancias</a>.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
