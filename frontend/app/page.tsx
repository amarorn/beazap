'use client'

import { useQuery } from '@tanstack/react-query'
import { metricsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { VolumeChart } from '@/components/dashboard/VolumeChart'
import { StatusDonut } from '@/components/dashboard/StatusDonut'
import { AttendantsTable } from '@/components/dashboard/AttendantsTable'
import { RecentConversations } from '@/components/dashboard/RecentConversations'
import { AnalysisChart } from '@/components/dashboard/AnalysisChart'
import { formatResponseTime } from '@/lib/utils'

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

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations-recent', selectedInstanceId],
    queryFn: () => metricsApi.getConversations({ limit: 10, instance_id: selectedInstanceId }),
  })

  const { data: analysisStats } = useQuery({
    queryKey: ['analysis-stats', selectedInstanceId],
    queryFn: () => metricsApi.getAnalysisStats(selectedInstanceId),
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
            sub={`${overview.open_conversations} abertas`}
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

      {/* Analysis */}
      {analysisStats && <AnalysisChart data={analysisStats} />}

      {/* Attendants */}
      <AttendantsTable data={attendants} />

      {/* Recent Conversations */}
      <RecentConversations data={conversations} />
    </div>
  )
}
