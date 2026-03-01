'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { metricsApi, attendantsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { Users, MessageSquare, UserCheck, ShieldCheck, RefreshCw, Tag, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import type { ConversationDetail } from '@/types'

function GroupAvatar({ name, avatarUrl }: { name: string | null; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'Grupo'}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
      />
    )
  }
  if (name) {
    const initials = name
      .split(' ')
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() ?? '')
      .join('')
    return (
      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        {initials}
      </div>
    )
  }
  return (
    <div className="w-8 h-8 bg-zinc-200 dark:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 flex-shrink-0">
      <Users className="w-4 h-4" />
    </div>
  )
}

function GroupConfigRow({
  group,
  attendants,
}: {
  group: ConversationDetail
  attendants: { id: number; name: string; role: string }[]
}) {
  const queryClient = useQueryClient()
  const [responsible, setResponsible] = useState<string>(
    group.responsible_id ? String(group.responsible_id) : 'none'
  )
  const [manager, setManager] = useState<string>(
    group.manager_id ? String(group.manager_id) : 'none'
  )
  const [tags, setTags] = useState<string>(
    (group.group_tags || []).join(', ')
  )

  const configMutation = useMutation({
    mutationFn: (data: { responsible_id?: number | null; manager_id?: number | null; group_tags?: string[] }) =>
      metricsApi.updateGroupConfig(group.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  })

  function handleResponsibleChange(val: string) {
    setResponsible(val)
    configMutation.mutate({
      responsible_id: val !== 'none' ? Number(val) : null,
      manager_id: manager !== 'none' ? Number(manager) : null,
    })
  }

  function handleManagerChange(val: string) {
    setManager(val)
    configMutation.mutate({
      responsible_id: responsible !== 'none' ? Number(responsible) : null,
      manager_id: val !== 'none' ? Number(val) : null,
    })
  }

  function handleTagsBlur() {
    const newTags = tags.split(',').map(t => t.trim()).filter(Boolean)
    if (JSON.stringify(newTags) !== JSON.stringify(group.group_tags || [])) {
      configMutation.mutate({
        responsible_id: responsible !== 'none' ? Number(responsible) : null,
        manager_id: manager !== 'none' ? Number(manager) : null,
        group_tags: newTags,
      })
    }
  }

  const agents = attendants.filter(a => a.role === 'agent')
  const managers = attendants.filter(a => a.role === 'manager')

  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/60 transition-colors border-b border-zinc-50 dark:border-zinc-800/50 last:border-0">
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <GroupAvatar name={group.contact_name} avatarUrl={group.contact_avatar_url} />
          <span className="font-medium text-zinc-900 dark:text-zinc-100 block truncate max-w-[140px]">
            {group.contact_name || <span className="text-zinc-400 dark:text-zinc-500 italic">Sem nome</span>}
          </span>
        </div>
      </td>

      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1 items-center">
          {(group.group_tags || []).map(t => (
            <span
              key={t}
              className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
            >
              {t}
            </span>
          ))}
          <input
            type="text"
            value={tags}
            onChange={e => setTags(e.target.value)}
            onBlur={handleTagsBlur}
            placeholder="tag..."
            className="w-16 min-w-0 text-xs border border-dashed border-zinc-300 dark:border-zinc-600 rounded px-1.5 py-0.5 bg-transparent text-zinc-600 dark:text-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </td>

      <td className="px-3 py-3">
        <Select value={responsible} onValueChange={handleResponsibleChange}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <div className="flex items-center gap-1 min-w-0">
              <UserCheck className="w-3 h-3 text-blue-500 flex-shrink-0" />
              <SelectValue placeholder="Ninguém" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem responsável</SelectItem>
            {(agents.length > 0 ? agents : attendants).map(a => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="px-3 py-3">
        <Select value={manager} onValueChange={handleManagerChange}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <div className="flex items-center gap-1 min-w-0">
              <ShieldCheck className="w-3 h-3 text-violet-500 flex-shrink-0" />
              <SelectValue placeholder="Ninguém" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem gerente</SelectItem>
            {(managers.length > 0 ? managers : attendants).map(a => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap text-xs hidden lg:table-cell">
        {formatDate(group.opened_at)}
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="flex items-center gap-0.5 text-zinc-500 dark:text-zinc-400" title="Recebidas">
            <ArrowDownToLine className="w-3 h-3" />
            {group.inbound_count}
          </span>
          <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400" title="Enviadas">
            <ArrowUpFromLine className="w-3 h-3" />
            {group.outbound_count}
          </span>
        </div>
      </td>

      <td className="px-3 py-3">
        <Link href={`/groups/${group.id}`}>
          <button className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 px-2 py-1.5 rounded-md transition-colors whitespace-nowrap">
            <MessageSquare className="w-3.5 h-3.5" />
            Chat
          </button>
        </Link>
      </td>
    </tr>
  )
}

export default function GroupsPage() {
  const { selectedInstanceId } = useInstance()
  const queryClient = useQueryClient()
  const [tagFilter, setTagFilter] = useState<string>('')

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups', selectedInstanceId, tagFilter],
    queryFn: () =>
      metricsApi.getGroups({
        instance_id: selectedInstanceId,
        limit: 100,
        ...(tagFilter ? { tag: tagFilter } : {}),
      }),
  })

  const { data: groupOverview } = useQuery({
    queryKey: ['groups-overview', selectedInstanceId],
    queryFn: () => metricsApi.getGroupOverview(selectedInstanceId),
  })

  const { data: attendants = [] } = useQuery({
    queryKey: ['attendants-list'],
    queryFn: () => attendantsApi.list(),
  })

  const syncMutation = useMutation({
    mutationFn: () => metricsApi.syncGroupNames(selectedInstanceId!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      if (data.error) {
        alert(`Erro ao sincronizar: ${data.error}`)
      } else {
        alert(`${data.updated} grupo(s) atualizado(s) de ${data.total_api ?? '?'} encontrado(s) na API`)
      }
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(err)
      alert(`Erro: ${msg}`)
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Grupos</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Vincule responsável e gerente a cada grupo para acompanhamento
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="self-start sm:self-center h-9 gap-2 text-zinc-600 dark:text-zinc-400"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !selectedInstanceId}
        >
          <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar nomes'}
        </Button>
      </div>

      {groupOverview && groupOverview.total_groups > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard
            label="Total de Grupos"
            value={groupOverview.total_groups}
            sub="Monitorados"
            accent="green"
          />
          <KpiCard
            label="Com Responsável"
            value={groupOverview.groups_with_responsible}
            sub={`${groupOverview.total_groups > 0 ? Math.round((groupOverview.groups_with_responsible / groupOverview.total_groups) * 100) : 0}%`}
            accent="blue"
          />
          <KpiCard
            label="Sem Responsável"
            value={groupOverview.groups_without_responsible}
            sub="Pendente"
            accent="yellow"
          />
          <KpiCard
            label="Ativos Hoje"
            value={groupOverview.groups_active_today}
            sub="Com mensagens"
            accent="purple"
          />
          <KpiCard
            label="Msgs Hoje"
            value={groupOverview.messages_in_groups_today}
            sub="Em grupos"
            accent="green"
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 flex-1">
          <Tag className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Filtrar por tag:</span>
          <input
            type="text"
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            placeholder="ex: vendas, suporte"
            className="flex-1 min-w-0 max-w-48 text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-blue-500" />
            Responsável — monitora o grupo
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-violet-500" />
            Gerente — supervisor direto
          </span>
        </div>
      </div>

      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80">
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide whitespace-nowrap">Grupo</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide whitespace-nowrap">Tags</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide whitespace-nowrap">Responsável</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide whitespace-nowrap">Gerente</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">1ª msg</th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide whitespace-nowrap">Msgs</th>
                <th className="px-3 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-zinc-400 dark:text-zinc-500">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && groups.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-zinc-400 dark:text-zinc-500">
                    Nenhum grupo encontrado. Envie uma mensagem em um grupo onde o WhatsApp está conectado.
                  </td>
                </tr>
              )}
              {groups.map(group => (
                <GroupConfigRow
                  key={`${group.id}-${(group.group_tags || []).join(',')}`}
                  group={group}
                  attendants={attendants}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
