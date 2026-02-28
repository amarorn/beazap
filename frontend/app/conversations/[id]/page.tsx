'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { metricsApi, attendantsApi } from '@/lib/api'
import { formatResponseTime, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Phone, User, Clock, CheckCircle, Sparkles } from 'lucide-react'
import { AnalysisBadge } from '@/components/analysis/AnalysisBadge'

const statusConfig = {
  open: { label: 'Aberta', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  resolved: { label: 'Resolvida', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  abandoned: { label: 'Abandonada', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDay(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ConversationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = Number(params.id)

  const { data: conversation, isLoading: loadingConv } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => metricsApi.getConversation(id),
    enabled: !!id,
  })

  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ['messages', id],
    queryFn: () => metricsApi.getMessages(id),
    enabled: !!id,
    refetchInterval: conversation?.status === 'open' ? 5000 : false,
  })

  const resolveMutation = useMutation({
    mutationFn: metricsApi.resolveConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })

  const analyzeMutation = useMutation({
    mutationFn: metricsApi.analyzeConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] })
    },
  })

  const { data: attendants = [] } = useQuery({
    queryKey: ['attendants-list'],
    queryFn: () => attendantsApi.list(),
  })

  const assignMutation = useMutation({
    mutationFn: ({ attendant_id }: { attendant_id: number | null }) =>
      metricsApi.assignConversation(id, attendant_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['sla-alerts'] })
    },
  })

  if (loadingConv) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 dark:text-zinc-500 text-sm">
        Carregando conversa...
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 dark:text-zinc-500 text-sm">
        Conversa não encontrada.
      </div>
    )
  }

  const status = statusConfig[conversation.status]

  // Group messages by day for date separators
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
        <div className="flex-1">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {conversation.contact_name || conversation.contact_phone}
          </h1>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{conversation.contact_phone}</p>
        </div>
        <Badge className={`text-xs ${status.className}`}>{status.label}</Badge>
      </div>

      {/* Meta info */}
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardContent className="py-3 flex flex-wrap gap-5 text-sm">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <User className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
            <Select
              value={conversation.attendant_name ? String(attendants.find(a => a.name === conversation.attendant_name)?.id ?? '') : 'none'}
              onValueChange={v => assignMutation.mutate({ attendant_id: v === 'none' ? null : Number(v) })}
              disabled={assignMutation.isPending}
            >
              <SelectTrigger className="h-6 text-xs border-0 bg-transparent shadow-none px-0 gap-1 focus:ring-0 w-auto min-w-[120px]">
                <SelectValue placeholder="Sem atendente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem atendente</SelectItem>
                {attendants.map(att => (
                  <SelectItem key={att.id} value={String(att.id)}>
                    {att.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <Phone className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            <span>{conversation.inbound_count}↓ {conversation.outbound_count}↑ mensagens</span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <Clock className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            <span>1ª resp: {formatResponseTime(conversation.first_response_time_seconds)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span>Aberta {formatDate(conversation.opened_at)}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!conversation.analysis_category && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 text-zinc-400 dark:text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                onClick={() => analyzeMutation.mutate(conversation.id)}
                disabled={analyzeMutation.isPending}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                {analyzeMutation.isPending ? 'Analisando...' : 'Analisar'}
              </Button>
            )}
            {conversation.status === 'open' && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                onClick={() => resolveMutation.mutate(conversation.id)}
                disabled={resolveMutation.isPending}
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                Resolver
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Analysis block */}
      {conversation.analysis_category && (
        <AnalysisBadge conv={conversation} />
      )}

      {/* Chat */}
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardContent className="py-4 px-4 space-y-1 min-h-[300px] max-h-[60vh] overflow-y-auto flex flex-col">
          {loadingMsgs && (
            <p className="text-center text-zinc-400 dark:text-zinc-500 text-sm py-8">Carregando mensagens...</p>
          )}

          {!loadingMsgs && messages.length === 0 && (
            <p className="text-center text-zinc-400 dark:text-zinc-500 text-sm py-8">Nenhuma mensagem registrada.</p>
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
                return (
                  <div
                    key={msg.id}
                    className={`flex mb-1.5 ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-snug shadow-sm ${
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
                      <p
                        className={`text-xs mt-1 text-right ${
                          isOutbound ? 'text-emerald-100' : 'text-zinc-400 dark:text-zinc-500'
                        }`}
                      >
                        {formatTime(msg.timestamp)}
                      </p>
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
