'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { metricsApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Users, MessageSquare } from 'lucide-react'

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDay(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function GroupDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = Number(params.id)

  const { data: group, isLoading: loadingGroup } = useQuery({
    queryKey: ['group-detail', id],
    queryFn: () => metricsApi.getConversation(id),
    enabled: !!id,
  })

  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ['group-messages', id],
    queryFn: () => metricsApi.getGroupMessages(id),
    enabled: !!id,
    refetchInterval: 10000,
  })

  if (loadingGroup) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 dark:text-zinc-500 text-sm">
        Carregando grupo...
      </div>
    )
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 dark:text-zinc-500 text-sm">
        Grupo não encontrado.
      </div>
    )
  }

  // Group messages by day
  const grouped: { day: string; items: typeof messages }[] = []
  for (const msg of messages) {
    const day = formatDay(msg.timestamp)
    const last = grouped[grouped.length - 1]
    if (!last || last.day !== day) {
      grouped.push({ day, items: [msg] })
    } else {
      last.items.push(msg)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {group.contact_avatar_url ? (
          <img
            src={group.contact_avatar_url}
            alt={group.contact_name || 'Grupo'}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-9 h-9 bg-emerald-50 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {group.contact_name || 'Grupo sem nome'}
          </h1>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{group.contact_phone}</p>
        </div>
      </div>

      {/* Meta */}
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardContent className="py-3 flex flex-wrap gap-5 text-sm">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <MessageSquare className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            <span>{group.inbound_count} recebidas · {group.outbound_count} enviadas</span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span>Desde {formatDate(group.opened_at)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Chat */}
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardContent className="py-4 px-4 min-h-[300px] max-h-[60vh] overflow-y-auto flex flex-col">
          {loadingMsgs && (
            <p className="text-center text-zinc-400 dark:text-zinc-500 text-sm py-8">Carregando mensagens...</p>
          )}

          {!loadingMsgs && messages.length === 0 && (
            <p className="text-center text-zinc-400 dark:text-zinc-500 text-sm py-8">
              Nenhuma mensagem registrada.
            </p>
          )}

          {grouped.map(({ day, items }) => (
            <div key={day}>
              {/* Day separator */}
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-700" />
                <span className="text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">{day}</span>
                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-700" />
              </div>

              {items.map(msg => {
                const isOutbound = msg.direction === 'outbound'
                const senderLabel = msg.sender_name || msg.sender_phone
                return (
                  <div
                    key={msg.id}
                    className={`flex mb-2 ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[75%] ${isOutbound ? '' : ''}`}>
                      {/* Sender label for group inbound messages */}
                      {!isOutbound && senderLabel && (
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-0.5 px-1">
                          {senderLabel}
                        </p>
                      )}
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm leading-snug shadow-sm ${
                          isOutbound
                            ? 'bg-emerald-500 text-white rounded-br-sm'
                            : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-bl-sm'
                        }`}
                      >
                        {msg.msg_type !== 'text' && (
                          <p className={`text-xs mb-1 ${isOutbound ? 'text-emerald-100' : 'text-zinc-400 dark:text-zinc-500'}`}>
                            [{msg.msg_type}]
                          </p>
                        )}
                        {msg.content ? (
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        ) : (
                          <p className={`italic text-xs ${isOutbound ? 'text-emerald-100' : 'text-zinc-400 dark:text-zinc-500'}`}>
                            (mídia sem texto)
                          </p>
                        )}
                        <p className={`text-xs mt-1 text-right ${isOutbound ? 'text-emerald-100' : 'text-zinc-400 dark:text-zinc-500'}`}>
                          {formatTime(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
