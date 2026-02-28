'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { metricsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { VolumeChart } from '@/components/dashboard/VolumeChart'
import { PeakHoursChart } from '@/components/dashboard/PeakHoursChart'
import { ExtendedMetricsCharts } from '@/components/dashboard/ExtendedMetricsCharts'
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

  const { data: comparison } = useQuery({
    queryKey: ['overview-comparison', selectedInstanceId],
    queryFn: () => metricsApi.getOverviewComparison(7, selectedInstanceId),
  })

  const { data: hourlyVolume = [] } = useQuery({
    queryKey: ['hourly-volume', selectedInstanceId],
    queryFn: () => metricsApi.getHourlyVolume(7, selectedInstanceId),
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

  const { data: extendedMetrics } = useQuery({
    queryKey: ['extended-metrics', selectedInstanceId],
    queryFn: () => metricsApi.getExtendedMetrics(selectedInstanceId),
  })

  const { data: dailyExtendedMetrics = [] } = useQuery({
    queryKey: ['daily-extended-metrics', selectedInstanceId],
    queryFn: () => metricsApi.getDailyExtendedMetrics(7, selectedInstanceId),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Visão geral dos atendimentos em tempo real</p>
      </div>

      {/* KPI Cards */}
      {comparison?.overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Conversas Hoje"
            value={comparison.overview.total_conversations_today}
            sub={`${comparison.overview.waiting_conversations} esperando, ${comparison.overview.in_progress_conversations} em atendimento`}
            accent="green"
            change={comparison.change_conversations_today}
          />
          <KpiCard
            label="Mensagens Hoje"
            value={comparison.overview.total_messages_today}
            sub="Recebidas + enviadas"
            accent="blue"
            change={comparison.change_messages_today}
          />
          <KpiCard
            label="T.M. 1ª Resposta"
            value={formatResponseTime(comparison.overview.avg_first_response_seconds)}
            sub="Média geral"
            accent="yellow"
          />
          <KpiCard
            label="Taxa de Resolução"
            value={`${comparison.overview.resolution_rate}%`}
            progress={comparison.overview.resolution_rate}
            accent="green"
            change={comparison.change_resolution_rate}
          />
        </div>
      )}

      {extendedMetrics && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Métricas de Atendimento</h2>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <KpiCard
              label="T.M. Resolução"
              value={formatResponseTime(extendedMetrics.avg_resolution_time_seconds)}
              sub="Abertura até conclusão"
              accent="blue"
            />
            <KpiCard
              label="Taxa Abandono"
              value={`${extendedMetrics.abandonment_rate}%`}
              sub="Conversas abandonadas"
              accent="red"
            />
            <KpiCard
              label="SLA 5 min"
              value={`${extendedMetrics.sla_5min_rate}%`}
              sub="1ª resposta em até 5 min"
              accent="green"
            />
            <KpiCard
              label="SLA 15 min"
              value={`${extendedMetrics.sla_15min_rate}%`}
              sub="1ª resposta em até 15 min"
              accent="green"
            />
            <KpiCard
              label="SLA 30 min"
              value={`${extendedMetrics.sla_30min_rate}%`}
              sub="1ª resposta em até 30 min"
              accent="green"
            />
            <KpiCard
              label="Sem Resposta"
              value={extendedMetrics.conversations_no_response_4h}
              sub={`${extendedMetrics.conversations_no_response_1h} há 1h+`}
              accent={extendedMetrics.conversations_no_response_4h > 0 ? 'red' : 'green'}
            />
          </div>
          <ExtendedMetricsCharts data={dailyExtendedMetrics} />
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
        {comparison?.overview && (
          <div>
            <StatusDonut data={comparison.overview} />
          </div>
        )}
      </div>

      <PeakHoursChart data={hourlyVolume} />

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
