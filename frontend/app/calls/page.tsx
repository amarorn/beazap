'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { metricsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { Card } from '@/components/ui/card'
import { Phone, PhoneIncoming, PhoneOutgoing, Video, MessageSquare } from 'lucide-react'
import type { CallLogEntry } from '@/types'

function formatTimestamp(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  if (isToday) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(secs: number | null) {
  if (secs == null || secs <= 0) return '-'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export default function CallsPage() {
  const { selectedInstanceId } = useInstance()
  const [directionFilter, setDirectionFilter] = useState<string>('')

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ['calls', selectedInstanceId, directionFilter],
    queryFn: () =>
      metricsApi.getCalls({
        instance_id: selectedInstanceId,
        limit: 100,
        ...(directionFilter ? { direction: directionFilter } : {}),
      }),
  })

  const inboundCount = calls.filter(c => c.direction === 'inbound').length
  const outboundCount = calls.filter(c => c.direction === 'outbound').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Ligações</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
          Histórico de ligações feitas e recebidas via WhatsApp
        </p>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800">
          <PhoneIncoming className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-zinc-600 dark:text-zinc-400">Recebidas</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{inboundCount}</span>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800">
          <PhoneOutgoing className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-zinc-600 dark:text-zinc-400">Enviadas</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{outboundCount}</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Filtrar por direção:</span>
          <select
            value={directionFilter}
            onChange={e => setDirectionFilter(e.target.value)}
            className="text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todas</option>
            <option value="inbound">Recebidas</option>
            <option value="outbound">Enviadas</option>
          </select>
        </div>
      </div>

      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80">
                <th className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold whitespace-nowrap">Contato</th>
                <th className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold whitespace-nowrap">Direção</th>
                <th className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold whitespace-nowrap">Duração</th>
                <th className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold whitespace-nowrap">Data/Hora</th>
                <th className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold whitespace-nowrap w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-zinc-400 dark:text-zinc-500">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && calls.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-zinc-400 dark:text-zinc-500">
                    Nenhuma ligação registrada. As ligações aparecem aqui quando a Evolution API envia eventos de ligação (call ou callLogMessage).
                  </td>
                </tr>
              )}
              {calls.map((call: CallLogEntry) => (
                <tr
                  key={call.id}
                  className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/60 transition-colors border-b border-zinc-50 dark:border-zinc-800/50 last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100 block truncate">
                        {call.contact_name || call.contact_phone || 'Desconhecido'}
                      </span>
                      {call.contact_name && (
                        <span className="text-[10px] font-mono text-zinc-400">{call.contact_phone}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        call.direction === 'inbound'
                          ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      }`}
                    >
                      {call.direction === 'inbound' ? (
                        <PhoneIncoming className="w-3 h-3" />
                      ) : (
                        <PhoneOutgoing className="w-3 h-3" />
                      )}
                      {call.direction === 'inbound' ? 'Recebida' : 'Enviada'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {call.content || call.call_outcome || '-'}
                    </span>
                    {call.is_video_call && (
                      <Video className="w-3.5 h-3.5 inline ml-1 text-zinc-500" title="Vídeo" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                    {formatDuration(call.call_duration_secs)}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                    {formatTimestamp(call.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/conversations/${call.conversation_id}`}>
                      <button className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 px-2 py-1.5 rounded-md transition-colors">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ver chat
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
