'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { metricsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { VolumeChart } from '@/components/dashboard/VolumeChart'
import { SlaChart } from '@/components/dashboard/SlaChart'
import { StatusChart } from '@/components/dashboard/StatusChart'
import { StatusDonut } from '@/components/dashboard/StatusDonut'
import { AttendantsTable } from '@/components/dashboard/AttendantsTable'
import { RecentConversations } from '@/components/dashboard/RecentConversations'
import { AnalysisChart } from '@/components/dashboard/AnalysisChart'
import { formatResponseTime } from '@/lib/utils'
import { Users, ChevronRight } from 'lucide-react'

export default function DashboardPage() {
  const { selectedInstanceId } = useInstance()

  const { data: overview } = useQuery({
    queryKey: ['overview', selectedInstanceId],
    queryFn: () => metricsApi.getOverview(selectedInstanceId),
  })

  const { data: attendants = [] } = useQuery({
    queryKey: ['attendants-metrics', selectedInstanceId],
    queryFn: () => metricsApi.getAttendants(selectedInstanceId),
  })

  const { data: dailyVolume = [] } = useQuery({
    queryKey: ['daily-volume', selectedInstanceId],
    queryFn: () => metricsApi.getDailyVolume(7, selectedInstanceId),
  })

  const { data: dailySla = [] } = useQuery({
    queryKey: ['daily-sla', selectedInstanceId],
    queryFn: () => metricsApi.getDailySla(7, selectedInstanceId),
  })

  const { data: dailyStatus = [] } = useQuery({
    queryKey: ['daily-status', selectedInstanceId],
    queryFn: () => metricsApi.getDailyStatus(7, selectedInstanceId),
  })

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations-recent', selectedInstanceId],
    queryFn: () => metricsApi.getConversations({ limit: 10, instance_id: selectedInstanceId }),
  })

  const { data: analysisStats } = useQuery({
    queryKey: ['analysis-stats', selectedInstanceId],
    queryFn: () => metricsApi.getAnalysisStats(selectedInstanceId),
  })

  const { data: groupOverview } = useQuery({
    queryKey: ['groups-overview', selectedInstanceId],
    queryFn: () => metricsApi.getGroupOverview(selectedInstanceId),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Visão geral dos atendimentos em tempo real</p>
      </div>

      {/* KPI Cards */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Conversas Hoje"
            value={overview.total_conversations_today}
            sub={`${overview.waiting_conversations} esperando, ${overview.in_progress_conversations} em atendimento`}
            accent="green"
          />
          <KpiCard
            label="Mensagens Hoje"
            value={overview.total_messages_today}
            sub="Recebidas + enviadas"
            accent="blue"
          />
          <KpiCard
            label="T.M. 1ª Resposta"
            value={formatResponseTime(overview.avg_first_response_seconds)}
            sub="Média geral"
            accent="yellow"
          />
          <KpiCard
            label="Taxa de Resolução"
            value={`${overview.resolution_rate}%`}
            progress={overview.resolution_rate}
            accent="green"
          />
        </div>
      )}

      {/* Group Metrics */}
      {groupOverview && groupOverview.total_groups > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-500" />
              Métricas de Grupos
            </h2>
            <Link
              href="/groups"
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 transition-colors"
            >
              Ver grupos
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard
              label="Total de Grupos"
              value={groupOverview.total_groups}
              sub="Grupos monitorados"
              accent="green"
            />
            <KpiCard
              label="Com Responsável"
              value={groupOverview.groups_with_responsible}
              sub={`${groupOverview.total_groups > 0 ? Math.round((groupOverview.groups_with_responsible / groupOverview.total_groups) * 100) : 0}% do total`}
              accent="blue"
            />
            <KpiCard
              label="Sem Responsável"
              value={groupOverview.groups_without_responsible}
              sub="Pendente de atribuição"
              accent="yellow"
            />
            <KpiCard
              label="Ativos Hoje"
              value={groupOverview.groups_active_today}
              sub="Com mensagens hoje"
              accent="purple"
            />
            <KpiCard
              label="Msgs em Grupos"
              value={groupOverview.messages_in_groups_today}
              sub="Mensagens hoje"
              accent="green"
            />
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <VolumeChart data={dailyVolume} />
        </div>
        {overview && (
          <div>
            <StatusDonut data={overview} />
          </div>
        )}
      </div>

      {/* Status Chart - Bar + Lines */}
      <StatusChart data={dailyStatus} />

      {/* SLA Chart */}
      <SlaChart data={dailySla} />

      {/* Analysis */}
      {analysisStats && <AnalysisChart data={analysisStats} />}

      {/* Attendants */}
      <AttendantsTable data={attendants} />

      {/* Recent Conversations */}
      <RecentConversations data={conversations} />
    </div>
  )
}
