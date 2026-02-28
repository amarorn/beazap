'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { metricsApi, attendantsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatResponseTime, formatDate } from '@/lib/utils'
import { MessageSquare, Sparkles } from 'lucide-react'
import { AnalysisBadge } from '@/components/analysis/AnalysisBadge'

const statusConfig = {
  open: { label: 'Aberta', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  resolved: { label: 'Resolvida', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  abandoned: { label: 'Abandonada', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
}

export default function ConversationsPage() {
  const { selectedInstanceId } = useInstance()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [attendantFilter, setAttendantFilter] = useState<string>('all')

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations', selectedInstanceId, statusFilter, attendantFilter],
    queryFn: () =>
      metricsApi.getConversations({
        limit: 50,
        instance_id: selectedInstanceId,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        attendant_id: attendantFilter !== 'all' ? Number(attendantFilter) : undefined,
      }),
  })

  const { data: attendants = [] } = useQuery({
    queryKey: ['attendants-list'],
    queryFn: () => attendantsApi.list(),
  })

  const resolveMutation = useMutation({
    mutationFn: metricsApi.resolveConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })

  const analyzeMutation = useMutation({
    mutationFn: metricsApi.analyzeConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Atendimentos</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Histórico completo de conversas</p>
      </div>

      {/* Filters */}
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardContent className="py-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Status:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 text-sm h-8">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Abertas</SelectItem>
                <SelectItem value="resolved">Resolvidas</SelectItem>
                <SelectItem value="abandoned">Abandonadas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Atendente:</span>
            <Select value={attendantFilter} onValueChange={setAttendantFilter}>
              <SelectTrigger className="w-40 text-sm h-8">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {attendants.map(att => (
                  <SelectItem key={att.id} value={String(att.id)}>
                    {att.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto">{conversations.length} resultado(s)</span>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/80">
                {['Contato', 'Atendente', 'Status', 'Abertura', '1ª Resposta', 'Msgs', 'Análise', 'Ação'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
              {conversations.map(conv => {
                const status = statusConfig[conv.status]
                return (
                  <tr key={conv.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/60 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{conv.contact_name || '—'}</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">{conv.contact_phone}</p>
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">{conv.attendant_name || '—'}</td>
                    <td className="px-5 py-3">
                      <Badge className={`text-xs ${status.className}`}>{status.label}</Badge>
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{formatDate(conv.opened_at)}</td>
                    <td className="px-5 py-3 font-medium text-zinc-700 dark:text-zinc-300">
                      {formatResponseTime(conv.first_response_time_seconds)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">{conv.inbound_count}↓</span>
                      <span className="text-xs text-emerald-600 ml-1">{conv.outbound_count}↑</span>
                    </td>
                    <td className="px-5 py-3">
                      {conv.analysis_category ? (
                        <AnalysisBadge conv={conv} compact />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 text-zinc-400 dark:text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 px-2"
                          onClick={() => analyzeMutation.mutate(conv.id)}
                          disabled={analyzeMutation.isPending}
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-1" />
                          Analisar
                        </Button>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/conversations/${conv.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 px-2"
                          >
                            <MessageSquare className="w-3.5 h-3.5 mr-1" />
                            Ver
                          </Button>
                        </Link>
                        {conv.status === 'open' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => resolveMutation.mutate(conv.id)}
                            disabled={resolveMutation.isPending}
                          >
                            Resolver
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {conversations.length === 0 && (
            <div className="text-center py-12 text-zinc-400 dark:text-zinc-500 text-sm">
              Nenhum atendimento encontrado
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
