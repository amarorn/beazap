'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instancesApi, teamsApi, metricsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { formatResponseTime } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Plus, Users, Sparkles, Clock, TrendingUp, AlertCircle } from 'lucide-react'

function MetricBox({
  label,
  value,
  color = 'zinc',
}: {
  label: string
  value: string | number
  color?: 'zinc' | 'emerald' | 'amber' | 'blue' | 'red' | 'indigo'
}) {
  const valueColor = {
    zinc: 'text-zinc-900 dark:text-zinc-100',
    emerald: 'text-emerald-700 dark:text-emerald-400',
    amber: 'text-amber-700 dark:text-amber-400',
    blue: 'text-blue-700 dark:text-blue-400',
    red: 'text-red-700 dark:text-red-400',
    indigo: 'text-indigo-700 dark:text-indigo-400',
  }[color]

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`text-lg font-bold leading-tight ${valueColor}`}>{value}</p>
    </div>
  )
}

export default function TeamsPage() {
  const queryClient = useQueryClient()
  const { selectedInstanceId } = useInstance()

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesApi.list,
  })

  const { data: teams = [] } = useQuery({
    queryKey: ['teams-list'],
    queryFn: () => teamsApi.list(),
  })

  const { data: teamMetrics = [], isLoading: loadingMetrics } = useQuery({
    queryKey: ['team-metrics', selectedInstanceId],
    queryFn: () => metricsApi.getTeamMetrics(selectedInstanceId),
    refetchInterval: 30_000,
  })

  const [selectedTeamInstance, setSelectedTeamInstance] = useState(
    selectedInstanceId ? String(selectedInstanceId) : ''
  )
  const [teamForm, setTeamForm] = useState({ name: '', description: '', keywords: '' })
  const [showForm, setShowForm] = useState(false)

  const createTeam = useMutation({
    mutationFn: teamsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams-list'] })
      queryClient.invalidateQueries({ queryKey: ['team-metrics'] })
      setTeamForm({ name: '', description: '', keywords: '' })
      setShowForm(false)
    },
  })

  const deleteTeam = useMutation({
    mutationFn: teamsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams-list'] })
      queryClient.invalidateQueries({ queryKey: ['team-metrics'] })
    },
  })

  const inputClass = "w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"

  const teamsWithMetrics = teams.map(t => ({
    team: t,
    metrics: teamMetrics.find(m => m.team_id === t.id) ?? null,
  }))

  const filtered = selectedInstanceId
    ? teamsWithMetrics.filter(({ team }) => team.instance_id === selectedInstanceId)
    : teamsWithMetrics

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Equipes de Atendimento</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Performance em tempo real por equipe — roteamento automático via LLM
          </p>
        </div>
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
          onClick={() => setShowForm(v => !v)}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Nova Equipe
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="border-indigo-200 dark:border-indigo-900/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm dark:text-zinc-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-500" />
              Nova Equipe
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select value={selectedTeamInstance} onValueChange={setSelectedTeamInstance}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue placeholder="Instância" />
                </SelectTrigger>
                <SelectContent>
                  {instances.map(inst => (
                    <SelectItem key={inst.id} value={String(inst.id)}>{inst.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="text"
                placeholder="Nome (ex: Vendas, RH, Suporte)"
                value={teamForm.name}
                onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Descrição (opcional)"
                value={teamForm.description}
                onChange={e => setTeamForm(f => ({ ...f, description: e.target.value }))}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Palavras-chave: salário, demissão, vaga..."
                value={teamForm.keywords}
                onChange={e => setTeamForm(f => ({ ...f, keywords: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => createTeam.mutate({
                  name: teamForm.name,
                  description: teamForm.description || undefined,
                  keywords: teamForm.keywords || undefined,
                  instance_id: Number(selectedTeamInstance),
                })}
                disabled={createTeam.isPending || !teamForm.name || !selectedTeamInstance}
              >
                {createTeam.isPending ? 'Criando...' : 'Criar Equipe'}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
            {createTeam.isError && (
              <p className="text-xs text-red-500 mt-2">Erro ao criar equipe.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {filtered.length === 0 && !loadingMetrics && (
        <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
          <CardContent className="py-12 text-center space-y-3">
            <Users className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto" />
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Nenhuma equipe cadastrada</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Crie equipes como RH, Vendas e Suporte. O LLM roteará novas conversas automaticamente.
            </p>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white mt-2"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Criar primeira equipe
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Team cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filtered.map(({ team, metrics }) => (
          <Card key={team.id} className="border-zinc-100 dark:border-zinc-800 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base dark:text-zinc-100 truncate">{team.name}</CardTitle>
                    {team.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{team.description}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteTeam.mutate(team.id)}
                  className="text-zinc-400 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {team.keywords && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {team.keywords.split(',').map(k => k.trim()).filter(Boolean).map(k => (
                    <span key={k} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </CardHeader>

            <CardContent>
              {!metrics || metrics.total_conversations === 0 ? (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
                  {loadingMetrics ? 'Carregando métricas...' : 'Nenhuma conversa roteada ainda.'}
                </p>
              ) : (
                <div className="space-y-4">
                  {/* KPI grid */}
                  <div className="grid grid-cols-4 gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl">
                    <MetricBox label="Total" value={metrics.total_conversations} />
                    <MetricBox
                      label="Abertas"
                      value={metrics.open_conversations}
                      color={metrics.open_conversations > 0 ? 'blue' : 'zinc'}
                    />
                    <MetricBox
                      label="Resolvidas"
                      value={metrics.resolved_conversations}
                      color="emerald"
                    />
                    <MetricBox
                      label="Hoje"
                      value={metrics.conversations_today}
                      color="indigo"
                    />
                  </div>

                  {/* Detail row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className={`flex items-center gap-2 p-2.5 rounded-lg ${
                      metrics.waiting_for_response > 0
                        ? 'bg-amber-50 dark:bg-amber-900/20'
                        : 'bg-zinc-50 dark:bg-zinc-800/50'
                    }`}>
                      <AlertCircle className={`w-4 h-4 flex-shrink-0 ${
                        metrics.waiting_for_response > 0 ? 'text-amber-500' : 'text-zinc-400'
                      }`} />
                      <div>
                        <p className={`text-sm font-bold ${
                          metrics.waiting_for_response > 0
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}>{metrics.waiting_for_response}</p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Aguardando</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <Clock className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                          {formatResponseTime(metrics.avg_first_response_seconds)}
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">1ª resposta</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <TrendingUp className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <div>
                        <p className={`text-sm font-bold ${
                          metrics.resolution_rate >= 70
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : metrics.resolution_rate >= 40
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-zinc-700 dark:text-zinc-300'
                        }`}>
                          {metrics.resolution_rate.toFixed(0)}%
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Resolução</p>
                      </div>
                    </div>
                  </div>

                  {/* Status bar */}
                  <div className="space-y-1.5">
                    <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                      {metrics.resolved_conversations > 0 && (
                        <div
                          className="bg-emerald-500"
                          style={{ width: `${(metrics.resolved_conversations / metrics.total_conversations) * 100}%` }}
                        />
                      )}
                      {metrics.open_conversations > 0 && (
                        <div
                          className="bg-blue-400"
                          style={{ width: `${(metrics.open_conversations / metrics.total_conversations) * 100}%` }}
                        />
                      )}
                      {metrics.abandoned_conversations > 0 && (
                        <div
                          className="bg-red-400"
                          style={{ width: `${(metrics.abandoned_conversations / metrics.total_conversations) * 100}%` }}
                        />
                      )}
                    </div>
                    <div className="flex gap-3 text-[10px] text-zinc-400 dark:text-zinc-500">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" />
                        {metrics.resolved_conversations} resolvidas
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-blue-400 rounded-full inline-block" />
                        {metrics.open_conversations} abertas
                      </span>
                      {metrics.abandoned_conversations > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-red-400 rounded-full inline-block" />
                          {metrics.abandoned_conversations} abandonadas
                        </span>
                      )}
                      <span className="ml-auto">{metrics.total_messages_received} msgs recebidas</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info box */}
      {filtered.length > 0 && (
        <Card className="border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-900/10 shadow-sm">
          <CardContent className="py-4 space-y-1.5">
            <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Como funciona o roteamento automático
            </p>
            <ul className="text-xs text-indigo-700 dark:text-indigo-400 space-y-1 list-disc list-inside">
              <li>Toda nova conversa inbound é analisada pelo LLM em background</li>
              <li>O LLM compara a mensagem com o nome, descrição e palavras-chave de cada equipe</li>
              <li>A equipe mais adequada é atribuída automaticamente à conversa</li>
              <li>Métricas atualizam a cada 30 segundos automaticamente</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
