'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useInstance } from '@/lib/instance-context'
import { metricsApi, reportsApi } from '@/lib/api'
import type { AttendantSummary } from '@/types'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area,
} from 'recharts'
import {
  TrendingUp, Clock, AlertTriangle, Brain, Activity,
  UserCheck, UsersRound, ArrowUpRight, ArrowDownRight,
  Download, FileSpreadsheet, FileText, Loader2, Sparkles, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadCsv, downloadXlsx, downloadPdf, type ExportSheet } from '@/lib/export'

function fmt(seconds?: number | null) {
  if (seconds == null) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`
}

type TabId = 'ai' | 'executive' | 'attendants' | 'sla' | 'analysis' | 'volume' | 'teams'

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'ai', label: 'Avaliação IA', icon: Sparkles },
  { id: 'executive', label: 'Executivo', icon: TrendingUp },
  { id: 'attendants', label: 'Atendentes', icon: UserCheck },
  { id: 'sla', label: 'SLA', icon: Clock },
  { id: 'analysis', label: 'Análise LLM', icon: Brain },
  { id: 'volume', label: 'Volume', icon: Activity },
  { id: 'teams', label: 'Equipes', icon: UsersRound },
]

const C = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.07] rounded-2xl p-5', className)}>
      {title && <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">{title}</h3>}
      {children}
    </div>
  )
}

function KpiCard({ label, value, trend }: { label: string; value: string; trend?: number }) {
  return (
    <div className="bg-white dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.07] rounded-2xl p-5">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
      {trend !== undefined && (
        <div className={cn('flex items-center gap-1 mt-2 text-xs font-medium', trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
          {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(trend).toFixed(1)}% vs período anterior
        </div>
      )}
    </div>
  )
}

const TOOLTIP_STYLE = {
  background: '#fff',
  border: '1px solid #e4e4e7',
  borderRadius: 8,
  fontSize: 12,
}

// ─── ExportBar ────────────────────────────────────────────────────────────────
function ExportBar({
  filename,
  title,
  subtitle,
  getSheets,
}: {
  filename: string
  title: string
  subtitle: string
  getSheets: () => ExportSheet[]
}) {
  const [loading, setLoading] = useState<'csv' | 'xlsx' | 'pdf' | null>(null)

  async function handle(type: 'csv' | 'xlsx' | 'pdf') {
    setLoading(type)
    try {
      const sheets = getSheets()
      if (type === 'csv') downloadCsv(filename, sheets)
      else if (type === 'xlsx') await downloadXlsx(filename, sheets)
      else await downloadPdf(filename, title, subtitle, sheets)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex items-center gap-2 justify-end mb-4">
      <span className="text-xs text-zinc-400 dark:text-zinc-500 mr-1">Exportar:</span>
      {([
        { type: 'csv', label: 'CSV', icon: Download },
        { type: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
        { type: 'pdf', label: 'PDF', icon: FileText },
      ] as { type: 'csv' | 'xlsx' | 'pdf'; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          onClick={() => handle(type)}
          disabled={loading !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/[0.08] hover:text-zinc-900 dark:hover:text-zinc-100 transition-all disabled:opacity-50"
        >
          {loading === type ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Icon className="w-3 h-3" />
          )}
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── Executive ──────────────────────────────────────────────────────────────────
function ExecutiveReport({ days, instanceId }: { days: number; instanceId?: number }) {
  const { data: comparison } = useQuery({
    queryKey: ['comparison', days, instanceId],
    queryFn: () => metricsApi.getOverviewComparison(days, instanceId),
  })
  const { data: extended } = useQuery({
    queryKey: ['extended', instanceId],
    queryFn: () => metricsApi.getExtendedMetrics(instanceId),
  })
  const { data: dailyVol = [] } = useQuery({
    queryKey: ['daily-vol', days, instanceId],
    queryFn: () => metricsApi.getDailyVolume(days, instanceId),
  })

  const ov = comparison?.overview

  function getSheets(): ExportSheet[] {
    return [
      {
        name: 'Resumo Executivo',
        headers: ['Métrica', 'Valor'],
        rows: [
          ['Total de Atendimentos', ov?.total_conversations ?? ''],
          ['Atendimentos Abertos', ov?.open_conversations ?? ''],
          ['Atendimentos Resolvidos', ov?.resolved_conversations ?? ''],
          ['Atendimentos Abandonados', ov?.abandoned_conversations ?? ''],
          ['Aguardando Resposta', ov?.waiting_conversations ?? ''],
          ['Taxa de Resolução', ov ? `${ov.resolution_rate.toFixed(1)}%` : ''],
          ['Tempo Médio de Resposta', fmt(ov?.avg_first_response_seconds)],
          ['Mensagens Hoje', ov?.total_messages_today ?? ''],
          ['Taxa de Abandono', extended ? `${extended.abandonment_rate.toFixed(1)}%` : ''],
          ['SLA 5min', extended ? `${extended.sla_5min_rate.toFixed(1)}%` : ''],
          ['SLA 15min', extended ? `${extended.sla_15min_rate.toFixed(1)}%` : ''],
          ['SLA 30min', extended ? `${extended.sla_30min_rate.toFixed(1)}%` : ''],
          ['Sem resposta há +1h', extended?.conversations_no_response_1h ?? ''],
          ['Sem resposta há +4h', extended?.conversations_no_response_4h ?? ''],
        ],
      },
      {
        name: 'Volume Diário',
        headers: ['Data', 'Conversas', 'Msgs Recebidas', 'Msgs Enviadas'],
        rows: dailyVol.map(d => [d.date, d.conversations, d.inbound, d.outbound]),
      },
    ]
  }

  return (
    <div className="space-y-5">
      <ExportBar
        filename="relatorio-executivo"
        title="Relatório Executivo"
        subtitle="Visão geral de desempenho"
        getSheets={getSheets}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total de Atendimentos" value={String(ov?.total_conversations ?? '—')} trend={comparison?.change_conversations_today} />
        <KpiCard label="Taxa de Resolução" value={ov ? `${ov.resolution_rate.toFixed(1)}%` : '—'} trend={comparison?.change_resolution_rate} />
        <KpiCard label="Tempo Médio de Resposta" value={fmt(ov?.avg_first_response_seconds)} />
        <KpiCard label="Mensagens Hoje" value={String(ov?.total_messages_today ?? '—')} trend={comparison?.change_messages_today} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Em Aberto" value={String(ov?.open_conversations ?? '—')} />
        <KpiCard label="Aguardando Resposta" value={String(ov?.waiting_conversations ?? '—')} />
        <KpiCard label="Taxa de Abandono" value={extended ? `${extended.abandonment_rate.toFixed(1)}%` : '—'} />
        <KpiCard label="Sem Resposta há +1h" value={String(extended?.conversations_no_response_1h ?? '—')} />
      </div>

      <Card title="Volume Diário">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={dailyVol} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="conversations" name="Conversas" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="inbound" name="Msgs Recebidas" fill="#6366f1" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {([
          { label: 'SLA 5min', value: extended?.sla_5min_rate },
          { label: 'SLA 15min', value: extended?.sla_15min_rate },
          { label: 'SLA 30min', value: extended?.sla_30min_rate },
        ] as { label: string; value: number | undefined }[]).map(({ label, value }) => (
          <Card key={label}>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {value != null ? `${value.toFixed(1)}%` : '—'}
            </p>
            <div className="mt-3 h-2 bg-zinc-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${value ?? 0}%` }}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Attendants ─────────────────────────────────────────────────────────────────
type AttSortKey = 'total_conversations' | 'resolution_rate' | 'avg_first_response_seconds' | 'total_messages_sent'

function AttendantsReport({ instanceId }: { instanceId?: number }) {
  const { data: attendants = [] } = useQuery({
    queryKey: ['attendant-metrics', instanceId],
    queryFn: () => metricsApi.getAttendants(instanceId),
  })

  const [sortKey, setSortKey] = useState<AttSortKey>('total_conversations')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = [...attendants].sort((a, b) => {
    const av = (a[sortKey] ?? 0) as number
    const bv = (b[sortKey] ?? 0) as number
    return sortDir === 'desc' ? bv - av : av - bv
  })

  function toggleSort(key: AttSortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortBtn({ k, label }: { k: AttSortKey; label: string }) {
    return (
      <button
        onClick={() => toggleSort(k)}
        className={cn(
          'text-xs font-medium hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors',
          sortKey === k ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'
        )}
      >
        {label} {sortKey === k && (sortDir === 'desc' ? '↓' : '↑')}
      </button>
    )
  }

  const chartData = sorted.slice(0, 10).map(a => ({
    name: a.attendant_name.split(' ')[0],
    resolved: a.resolved_conversations,
    open: a.open_conversations,
  }))

  function getSheets(): ExportSheet[] {
    return [{
      name: 'Performance Atendentes',
      headers: ['Atendente', 'Cargo', 'Total', 'Abertos', 'Resolvidos', 'Abandonados', 'T. Resposta', 'Msgs Enviadas', 'Taxa Resolução'],
      rows: sorted.map(a => [
        a.attendant_name,
        a.role === 'manager' ? 'Gerente' : 'Agente',
        a.total_conversations,
        a.open_conversations,
        a.resolved_conversations,
        a.abandoned_conversations,
        fmt(a.avg_first_response_seconds),
        a.total_messages_sent,
        `${a.resolution_rate.toFixed(1)}%`,
      ]),
    }]
  }

  return (
    <div className="space-y-5">
      <ExportBar
        filename="relatorio-atendentes"
        title="Performance de Atendentes"
        subtitle="Métricas individuais de desempenho"
        getSheets={getSheets}
      />
      <Card title="Atendimentos por Atendente">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={70} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="resolved" name="Resolvidos" fill="#10b981" radius={[0, 3, 3, 0]} stackId="a" />
            <Bar dataKey="open" name="Abertos" fill="#6366f1" radius={[0, 3, 3, 0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Tabela Detalhada">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-white/[0.06]">
                <th className="text-left pb-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Atendente</th>
                <th className="text-center pb-3"><SortBtn k="total_conversations" label="Total" /></th>
                <th className="text-center pb-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Abertos</th>
                <th className="text-center pb-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Resolvidos</th>
                <th className="text-center pb-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Abandonados</th>
                <th className="text-center pb-3"><SortBtn k="avg_first_response_seconds" label="T. Resposta" /></th>
                <th className="text-center pb-3"><SortBtn k="total_messages_sent" label="Msgs Enviadas" /></th>
                <th className="text-center pb-3"><SortBtn k="resolution_rate" label="Taxa" /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(att => (
                <tr key={att.attendant_id} className="border-b border-zinc-50 dark:border-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0',
                        att.role === 'manager' ? 'bg-violet-500' : 'bg-blue-500'
                      )}>
                        {att.attendant_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100 text-xs leading-none">{att.attendant_name}</p>
                        <p className="text-[10px] text-zinc-400 mt-0.5">{att.role === 'manager' ? 'Gerente' : 'Agente'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-center font-semibold text-zinc-900 dark:text-zinc-100">{att.total_conversations}</td>
                  <td className="py-3 text-center text-zinc-600 dark:text-zinc-400">{att.open_conversations}</td>
                  <td className="py-3 text-center text-emerald-600 dark:text-emerald-400">{att.resolved_conversations}</td>
                  <td className="py-3 text-center text-red-500">{att.abandoned_conversations}</td>
                  <td className="py-3 text-center text-zinc-600 dark:text-zinc-400">{fmt(att.avg_first_response_seconds)}</td>
                  <td className="py-3 text-center text-zinc-600 dark:text-zinc-400">{att.total_messages_sent}</td>
                  <td className="py-3 text-center">
                    <span className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-full',
                      att.resolution_rate >= 70
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                        : att.resolution_rate >= 40
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                    )}>
                      {att.resolution_rate.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-400 text-sm">Nenhum atendente cadastrado</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ─── SLA ────────────────────────────────────────────────────────────────────────
function SlaReport({ days, instanceId }: { days: number; instanceId?: number }) {
  const { data: extended } = useQuery({
    queryKey: ['extended', instanceId],
    queryFn: () => metricsApi.getExtendedMetrics(instanceId),
  })
  const { data: dailySla = [] } = useQuery({
    queryKey: ['daily-sla', days, instanceId],
    queryFn: () => metricsApi.getDailySla(days, instanceId),
  })
  const { data: dailyExt = [] } = useQuery({
    queryKey: ['daily-ext', days, instanceId],
    queryFn: () => metricsApi.getDailyExtendedMetrics(days, instanceId),
  })
  const { data: alerts } = useQuery({
    queryKey: ['sla-alerts', instanceId, 30],
    queryFn: () => metricsApi.getSlaAlerts({ instance_id: instanceId, threshold_minutes: 30 }),
    refetchInterval: 60_000,
  })

  const slaCards = [
    { label: 'SLA 5min', value: extended?.sla_5min_rate, color: 'emerald' },
    { label: 'SLA 15min', value: extended?.sla_15min_rate, color: 'blue' },
    { label: 'SLA 30min', value: extended?.sla_30min_rate, color: 'violet' },
    { label: 'Taxa de Abandono', value: extended?.abandonment_rate, color: 'red' },
  ] as { label: string; value: number | undefined; color: string }[]

  function getSheets(): ExportSheet[] {
    return [
      {
        name: 'Métricas SLA',
        headers: ['Métrica', 'Valor'],
        rows: [
          ['SLA 5min (% respondidos em até 5min)', extended ? `${extended.sla_5min_rate.toFixed(1)}%` : ''],
          ['SLA 15min (% respondidos em até 15min)', extended ? `${extended.sla_15min_rate.toFixed(1)}%` : ''],
          ['SLA 30min (% respondidos em até 30min)', extended ? `${extended.sla_30min_rate.toFixed(1)}%` : ''],
          ['Taxa de Abandono', extended ? `${extended.abandonment_rate.toFixed(1)}%` : ''],
          ['Sem resposta há +1h', extended?.conversations_no_response_1h ?? ''],
          ['Sem resposta há +4h', extended?.conversations_no_response_4h ?? ''],
        ],
      },
      {
        name: 'SLA por Dia',
        headers: ['Data', 'T. Médio Resposta', 'Qtd Respondidos', 'SLA 5min %', 'SLA 15min %', 'SLA 30min %', 'Abandono %'],
        rows: dailySla.map((d, i) => [
          d.date,
          fmt(d.avg_response_seconds),
          d.count,
          dailyExt[i]?.sla_5min_rate != null ? `${dailyExt[i].sla_5min_rate.toFixed(1)}%` : '',
          dailyExt[i]?.sla_15min_rate != null ? `${dailyExt[i].sla_15min_rate.toFixed(1)}%` : '',
          dailyExt[i]?.sla_30min_rate != null ? `${dailyExt[i].sla_30min_rate.toFixed(1)}%` : '',
          dailyExt[i]?.abandonment_rate != null ? `${dailyExt[i].abandonment_rate.toFixed(1)}%` : '',
        ]),
      },
      {
        name: 'Violações SLA',
        headers: ['Contato', 'Telefone', 'Atendente', 'Aberto em', 'Tempo Esperando'],
        rows: (alerts?.alerts ?? []).map(a => [
          a.contact_name ?? '',
          a.contact_phone,
          a.attendant_name ?? '',
          new Date(a.opened_at).toLocaleString('pt-BR'),
          `${Math.floor(a.wait_seconds / 60)}min`,
        ]),
      },
    ]
  }

  return (
    <div className="space-y-5">
      <ExportBar
        filename="relatorio-sla"
        title="Relatório de SLA"
        subtitle="Cumprimento de SLA e violações"
        getSheets={getSheets}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {slaCards.map(({ label, value, color }) => (
          <Card key={label}>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {value != null ? `${value.toFixed(1)}%` : '—'}
            </p>
            <div className="mt-3 h-2 bg-zinc-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  color === 'red' ? 'bg-red-500'
                    : color === 'blue' ? 'bg-blue-500'
                      : color === 'violet' ? 'bg-violet-500'
                        : 'bg-emerald-500'
                )}
                style={{ width: `${value ?? 0}%` }}
              />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card title="Tempo Médio de Resposta por Dia">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailySla}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} width={55} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number | undefined) => [fmt(v), 'Tempo médio']}
              />
              <Line dataKey="avg_response_seconds" name="Tempo médio" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Taxa de Abandono por Dia">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailyExt}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number | undefined) => [v != null ? `${v.toFixed(1)}%` : '—', 'Abandono']}
              />
              <Area dataKey="abandonment_rate" stroke="#ef4444" fill="#ef4444" fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Tendência de SLA">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={dailyExt}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number | undefined) => v != null ? `${v.toFixed(1)}%` : '—'} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area dataKey="sla_5min_rate" name="SLA 5min" stroke="#10b981" fill="#10b981" fillOpacity={0.08} strokeWidth={2} />
            <Area dataKey="sla_15min_rate" name="SLA 15min" stroke="#6366f1" fill="#6366f1" fillOpacity={0.08} strokeWidth={2} />
            <Area dataKey="sla_30min_rate" name="SLA 30min" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card title={`Violações SLA — Sem resposta há +30min (${alerts?.count ?? 0})`}>
        {alerts && alerts.alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.alerts.map(a => {
              const mins = Math.floor(a.wait_seconds / 60)
              const waitLabel = mins >= 60
                ? `${Math.floor(mins / 60)}h ${mins % 60}min`
                : `${mins}min`
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200/60 dark:border-red-500/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {a.contact_name || a.contact_phone}
                      </p>
                      {a.attendant_name && (
                        <p className="text-xs text-zinc-400">Atendente: {a.attendant_name}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/20 px-2.5 py-1 rounded-full">
                    {waitLabel}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-zinc-400 text-sm">
            Nenhuma violação de SLA no momento
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Analysis LLM ───────────────────────────────────────────────────────────────
const SENTIMENT_COLORS: Record<string, string> = {
  Positivo: '#10b981',
  Neutro: '#6366f1',
  Negativo: '#ef4444',
}

function AnalysisReport({ instanceId }: { instanceId?: number }) {
  const { data: stats } = useQuery({
    queryKey: ['analysis-stats', instanceId],
    queryFn: () => metricsApi.getAnalysisStats(instanceId),
  })

  const sentimentData = stats
    ? Object.entries(stats.sentiments).map(([key, count]) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1),
        value: count,
      }))
    : []

  const totalSent = sentimentData.reduce((s, d) => s + d.value, 0)
  const totalCats = stats?.categories.reduce((s, c) => s + c.count, 0) ?? 0

  function getSheets(): ExportSheet[] {
    return [
      {
        name: 'Resumo Análise',
        headers: ['Métrica', 'Valor'],
        rows: [
          ['Conversas Analisadas', stats?.total_analyzed ?? ''],
          ['Satisfação Média', stats?.avg_satisfaction != null ? `${stats.avg_satisfaction.toFixed(1)}/10` : ''],
        ],
      },
      {
        name: 'Categorias',
        headers: ['Categoria', 'Contagem', '%'],
        rows: (stats?.categories ?? []).map(cat => [
          cat.label,
          cat.count,
          totalCats > 0 ? `${((cat.count / totalCats) * 100).toFixed(1)}%` : '0%',
        ]),
      },
      {
        name: 'Sentimentos',
        headers: ['Sentimento', 'Contagem', '%'],
        rows: sentimentData.map(s => [
          s.name,
          s.value,
          totalSent > 0 ? `${((s.value / totalSent) * 100).toFixed(1)}%` : '0%',
        ]),
      },
    ]
  }

  return (
    <div className="space-y-5">
      <ExportBar
        filename="relatorio-analise-llm"
        title="Relatório de Análise LLM"
        subtitle="Categorias, sentimentos e satisfação"
        getSheets={getSheets}
      />
      <div className="grid grid-cols-2 gap-4">
        <KpiCard label="Conversas Analisadas" value={String(stats?.total_analyzed ?? '—')} />
        <KpiCard
          label="Satisfação Média"
          value={stats?.avg_satisfaction != null ? `${stats.avg_satisfaction.toFixed(1)}/10` : '—'}
        />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card title="Categorias">
          {stats && stats.categories.length > 0 ? (
            <div className="space-y-3">
              {stats.categories.map((cat, i) => {
                const pct = totalCats > 0 ? (cat.count / totalCats) * 100 : 0
                return (
                  <div key={cat.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">{cat.label}</span>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {cat.count} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: C[i % C.length] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-center text-zinc-400 text-sm py-6">Nenhuma análise disponível</p>
          )}
        </Card>

        <Card title="Sentimento">
          {sentimentData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {sentimentData.map((entry, i) => (
                      <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name] ?? C[i]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-1">
                {sentimentData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: SENTIMENT_COLORS[entry.name] ?? C[i] }}
                    />
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {entry.name} ({totalSent > 0 ? ((entry.value / totalSent) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-zinc-400 text-sm py-6">Nenhuma análise disponível</p>
          )}
        </Card>
      </div>

      {stats?.avg_satisfaction != null && (
        <Card title="Índice de Satisfação">
          <div className="flex items-center gap-6">
            <div className="text-center flex-shrink-0">
              <p className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
                {stats.avg_satisfaction.toFixed(1)}
              </p>
              <p className="text-xs text-zinc-400 mt-1">média / 10</p>
            </div>
            <div className="flex-1">
              <div className="h-3 bg-zinc-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 transition-all"
                  style={{ width: `${(stats.avg_satisfaction / 10) * 100}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-zinc-400">0</span>
                <span className="text-[10px] text-zinc-400">10</span>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Volume ──────────────────────────────────────────────────────────────────────
function VolumeReport({ days, instanceId }: { days: number; instanceId?: number }) {
  const { data: dailyVol = [] } = useQuery({
    queryKey: ['daily-vol', days, instanceId],
    queryFn: () => metricsApi.getDailyVolume(days, instanceId),
  })
  const { data: hourly = [] } = useQuery({
    queryKey: ['hourly', days, instanceId],
    queryFn: () => metricsApi.getHourlyVolume(days, instanceId),
  })
  const { data: dailyStatus = [] } = useQuery({
    queryKey: ['daily-status', days, instanceId],
    queryFn: () => metricsApi.getDailyStatus(days, instanceId),
  })

  const maxHourlyCount = Math.max(...hourly.map(h => h.count), 1)
  const peakHour = hourly.reduce(
    (max, h) => h.count > max.count ? h : max,
    hourly[0] ?? { count: 0, label: '—' }
  )

  const totalInbound = dailyVol.reduce((s, d) => s + d.inbound, 0)
  const totalOutbound = dailyVol.reduce((s, d) => s + d.outbound, 0)
  const totalConvs = dailyVol.reduce((s, d) => s + d.conversations, 0)

  function getSheets(): ExportSheet[] {
    return [
      {
        name: 'Volume Diário',
        headers: ['Data', 'Conversas', 'Msgs Recebidas', 'Msgs Enviadas'],
        rows: dailyVol.map(d => [d.date, d.conversations, d.inbound, d.outbound]),
      },
      {
        name: 'Horário de Pico',
        headers: ['Hora', 'Mensagens'],
        rows: hourly.map(h => [h.label, h.count]),
      },
      {
        name: 'Status Diário',
        headers: ['Data', 'Abertas', 'Em Andamento', 'Aguardando'],
        rows: dailyStatus.map(d => [d.date, d.opened, d.in_progress, d.waiting]),
      },
    ]
  }

  return (
    <div className="space-y-5">
      <ExportBar
        filename="relatorio-volume"
        title="Relatório de Volume"
        subtitle="Volume de mensagens e horário de pico"
        getSheets={getSheets}
      />
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Msgs Recebidas (período)" value={String(totalInbound)} />
        <KpiCard label="Msgs Enviadas (período)" value={String(totalOutbound)} />
        <KpiCard label="Conversas Abertas (período)" value={String(totalConvs)} />
      </div>

      <Card title="Volume Diário de Mensagens">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={dailyVol}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="inbound" name="Recebidas" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="outbound" name="Enviadas" fill="#6366f1" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title={`Horário de Pico — Pico: ${peakHour?.label ?? '—'} (${peakHour?.count ?? 0} msgs)`}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hourly} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" name="Mensagens" radius={[2, 2, 0, 0]}>
              {hourly.map((h, i) => (
                <Cell key={i} fill={h.count === maxHourlyCount && h.count > 0 ? '#f59e0b' : '#10b981'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Status Diário das Conversas">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={dailyStatus}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area dataKey="opened" name="Abertas" stroke="#10b981" fill="#10b981" fillOpacity={0.12} strokeWidth={2} stackId="a" />
            <Area dataKey="in_progress" name="Em Andamento" stroke="#6366f1" fill="#6366f1" fillOpacity={0.12} strokeWidth={2} stackId="a" />
            <Area dataKey="waiting" name="Aguardando" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.12} strokeWidth={2} stackId="a" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}

// ─── Teams ───────────────────────────────────────────────────────────────────────
function TeamsReport({ instanceId }: { instanceId?: number }) {
  const { data: teams = [] } = useQuery({
    queryKey: ['team-metrics', instanceId],
    queryFn: () => metricsApi.getTeamMetrics(instanceId),
  })

  const chartData = teams.map(t => ({
    name: t.team_name,
    resolved: t.resolved_conversations,
    open: t.open_conversations,
    abandoned: t.abandoned_conversations,
  }))

  function getSheets(): ExportSheet[] {
    return [{
      name: 'Equipes',
      headers: ['Equipe', 'Total', 'Abertos', 'Resolvidos', 'Abandonados', 'Hoje', 'T. Resposta', 'Taxa Resolução', 'Msgs Recebidas'],
      rows: teams.map(t => [
        t.team_name,
        t.total_conversations,
        t.open_conversations,
        t.resolved_conversations,
        t.abandoned_conversations,
        t.conversations_today,
        fmt(t.avg_first_response_seconds),
        `${t.resolution_rate.toFixed(1)}%`,
        t.total_messages_received,
      ]),
    }]
  }

  return (
    <div className="space-y-5">
      <ExportBar
        filename="relatorio-equipes"
        title="Relatório de Equipes"
        subtitle="Comparativo de desempenho por equipe"
        getSheets={getSheets}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Equipes Ativas" value={String(teams.length)} />
        <KpiCard label="Total de Atendimentos" value={String(teams.reduce((s, t) => s + t.total_conversations, 0))} />
        <KpiCard label="Resolvidos (equipes)" value={String(teams.reduce((s, t) => s + t.resolved_conversations, 0))} />
        <KpiCard label="Hoje (equipes)" value={String(teams.reduce((s, t) => s + t.conversations_today, 0))} />
      </div>

      <Card title="Atendimentos por Equipe">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="resolved" name="Resolvidos" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="open" name="Abertos" fill="#6366f1" radius={[3, 3, 0, 0]} />
            <Bar dataKey="abandoned" name="Abandonados" fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <Card title="Taxa de Resolução por Equipe">
          {teams.length > 0 ? (
            <div className="space-y-3">
              {[...teams].sort((a, b) => b.resolution_rate - a.resolution_rate).map((t, i) => (
                <div key={t.team_id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">{t.team_name}</span>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {t.resolution_rate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${t.resolution_rate}%`, background: C[i % C.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-zinc-400 text-sm py-6">Nenhuma equipe cadastrada</p>
          )}
        </Card>

        <Card title="Detalhes por Equipe">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-white/[0.06]">
                  {['Equipe', 'Total', 'Hoje', 'T. Resp.', 'Taxa'].map(h => (
                    <th key={h} className={cn('pb-3 text-xs font-medium text-zinc-500 dark:text-zinc-400', h === 'Equipe' ? 'text-left' : 'text-center')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={t.team_id} className="border-b border-zinc-50 dark:border-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                          style={{ background: C[i % C.length] }}
                        >
                          {t.team_name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{t.team_name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-center text-xs font-semibold text-zinc-900 dark:text-zinc-100">{t.total_conversations}</td>
                    <td className="py-2.5 text-center text-xs text-zinc-600 dark:text-zinc-400">{t.conversations_today}</td>
                    <td className="py-2.5 text-center text-xs text-zinc-600 dark:text-zinc-400">{fmt(t.avg_first_response_seconds)}</td>
                    <td className="py-2.5 text-center">
                      <span className={cn(
                        'text-xs font-semibold px-1.5 py-0.5 rounded-full',
                        t.resolution_rate >= 70
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                          : t.resolution_rate >= 40
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                      )}>
                        {t.resolution_rate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
                {teams.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-400 text-sm">Nenhuma equipe cadastrada</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── Avaliação IA ─────────────────────────────────────────────────────────────────
function SentimentBar({ sentiments }: { sentiments: Record<string, number> }) {
  const total = Object.values(sentiments).reduce((s, v) => s + v, 0)
  if (!total) return null
  const colors: Record<string, string> = { positivo: '#10b981', neutro: '#94a3b8', negativo: '#ef4444' }
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px">
      {Object.entries(sentiments).map(([k, v]) => (
        <div
          key={k}
          style={{ width: `${(v / total) * 100}%`, background: colors[k] ?? '#6366f1' }}
          title={`${k}: ${v}`}
        />
      ))}
    </div>
  )
}

function SummaryCard({ s }: { s: AttendantSummary }) {
  const roleLabel = s.role === 'manager' ? 'Gerente' : 'Agente'
  const roleCls = s.role === 'manager'
    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'

  const paragraphs = s.llm_summary?.split('\n').filter(Boolean) ?? []

  return (
    <div className="bg-white dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.07] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-md shadow-emerald-500/20">
            {s.attendant_name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">{s.attendant_name}</p>
            <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${roleCls}`}>
              {roleLabel}
            </span>
          </div>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0">
          Semana de {new Date(s.period_week + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
        </p>
      </div>

      {/* Chips de métricas */}
      <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-zinc-100 dark:border-white/[0.06]">
        <span className="px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-white/[0.04] text-xs font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200/80 dark:border-white/[0.06]">
          {s.total_conversations} conversas
        </span>
        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
          s.resolution_rate >= 70
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/30'
            : s.resolution_rate >= 40
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/30'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200/60 dark:border-red-800/30'
        }`}>
          {s.resolution_rate.toFixed(0)}% resolvidos
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-white/[0.04] text-xs font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200/80 dark:border-white/[0.06]">
          SLA 15min: {s.sla_15min_rate.toFixed(0)}%
        </span>
        {s.avg_satisfaction != null && (
          <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
            s.avg_satisfaction >= 4
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/30'
              : s.avg_satisfaction >= 3
                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/30'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200/60 dark:border-red-800/30'
          }`}>
            ★ {s.avg_satisfaction.toFixed(1)}/5 satisfação
          </span>
        )}
        {Object.keys(s.top_sentiments).length > 0 && (
          <div className="flex-1 min-w-[120px] flex items-center gap-2">
            <SentimentBar sentiments={s.top_sentiments} />
          </div>
        )}
      </div>

      {/* Texto do LLM */}
      <div className="px-5 py-4 space-y-3">
        {paragraphs.length > 0 ? (
          paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {p}
            </p>
          ))
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">Resumo não gerado para este atendente.</p>
        )}
      </div>

      {s.generated_at && (
        <div className="px-5 pb-3">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-600">
            Gerado em {new Date(s.generated_at).toLocaleString('pt-BR')}
          </p>
        </div>
      )}
    </div>
  )
}

function AiReportTab({ days, instanceId }: { days: number; instanceId?: number }) {
  const queryClient = useQueryClient()
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [debugData, setDebugData] = useState<Record<string, unknown> | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  const { data: summaries = [], isLoading, refetch } = useQuery({
    queryKey: ['ai-summaries', instanceId],
    queryFn: () => reportsApi.getAttendantSummaries({ instance_id: instanceId }),
  })

  async function handleDebug() {
    try {
      const data = await reportsApi.debug(instanceId)
      setDebugData(data)
      setShowDebug(true)
    } catch {
      setToast('Erro ao buscar diagnóstico.')
      setTimeout(() => setToast(null), 3000)
    }
  }

  async function handleGenerate() {
    if (!instanceId) {
      setToast('Selecione uma instância no menu lateral antes de gerar o relatório.')
      setTimeout(() => setToast(null), 4000)
      return
    }
    setGenerating(true)
    setToast('Gerando relatório em background… Aguarde 10–30s e clique em Atualizar.')
    try {
      await reportsApi.generate({ instance_id: instanceId, days })
      setTimeout(() => {
        refetch()
        setGenerating(false)
        setToast(null)
      }, 15000)
    } catch {
      setToast('Erro ao iniciar geração. Verifique as configurações do LLM.')
      setGenerating(false)
      setTimeout(() => setToast(null), 5000)
    }
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Avaliação Semanal por Atendente</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            O LLM analisa as métricas dos últimos {days} dias e gera um resumo de desempenho para cada operador.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDebug}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] transition-colors"
            title="Diagnóstico das tabelas raw"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Diagnóstico
          </button>
          <button
            onClick={() => { refetch(); queryClient.invalidateQueries({ queryKey: ['ai-summaries'] }) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors shadow-md shadow-emerald-500/25"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Gerando…</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Gerar Relatório</>
            )}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/30 text-sm text-blue-700 dark:text-blue-400">
          {toast}
        </div>
      )}

      {/* Debug panel */}
      {showDebug && debugData && (
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.07] bg-zinc-50 dark:bg-white/[0.03] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-white/[0.07] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Diagnóstico das Tabelas Raw</span>
            </div>
            <button onClick={() => setShowDebug(false)} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">fechar</button>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            {(() => {
              const src = debugData.source_conversations as Record<string, number> | undefined
              return src ? [
                ['Conversas na instância', src.total],
                ['Com atendente', src.with_attendant],
                ['Sem atendente', src.without_attendant],
                ['Abertas', src.open],
                ['Resolvidas', src.resolved],
                ['Abandonadas', src.abandoned],
              ].map(([label, val]) => (
                <div key={String(label)} className="flex justify-between gap-2 py-0.5 border-b border-zinc-100 dark:border-white/[0.04]">
                  <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
                  <span className={`font-semibold ${Number(val) === 0 ? 'text-red-500' : 'text-zinc-900 dark:text-zinc-100'}`}>{val}</span>
                </div>
              )) : null
            })()}
            {[
              ['atendimento_raw', debugData.atendimento_raw_count],
              ['cliente_atend_raw', debugData.cliente_atend_raw_count],
              ['atendente_raw', debugData.atendente_raw_count],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between gap-2 py-0.5 border-b border-zinc-100 dark:border-white/[0.04]">
                <span className="text-zinc-500 dark:text-zinc-400 font-mono">{String(label)}</span>
                <span className={`font-semibold ${Number(val) === 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{String(val)}</span>
              </div>
            ))}
          </div>
          {(debugData.atendimento_raw_count as number) === 0 && (
            <div className="px-4 pb-3 text-xs text-amber-700 dark:text-amber-400">
              ⚠ Tabelas vazias. Causas comuns: conversas sem atendente atribuído, ou período sem conversas.
              Selecione a instância correta e clique <strong>Gerar Relatório</strong>.
            </div>
          )}
          {(debugData.atendente_raw_count as number) > 0 && !summaries.some(s => s.llm_summary) && (
            <div className="px-4 pb-3 text-xs text-amber-700 dark:text-amber-400">
              ⚠ Dados agregados mas sem resumo LLM. Verifique se ANTHROPIC_API_KEY ou OPENAI_API_KEY está configurada no .env e reinicie o backend.
            </div>
          )}
        </div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-2xl bg-zinc-100 dark:bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : summaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4">
            <Sparkles className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Nenhum relatório gerado ainda</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-xs">
            Selecione uma instância, defina o período e clique em <strong>Gerar Relatório</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {summaries.map(s => (
            <SummaryCard key={s.attendant_id} s={s} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { selectedInstanceId } = useInstance()
  const [activeTab, setActiveTab] = useState<TabId>('executive')
  const [days, setDays] = useState(7)

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Relatórios</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Análise detalhada de desempenho</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 dark:text-zinc-400">Período:</label>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="text-sm border border-zinc-200 dark:border-white/[0.08] rounded-lg px-3 py-1.5 bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 appearance-none cursor-pointer"
          >
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-zinc-100 dark:bg-white/[0.04] p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === id
                ? 'bg-white dark:bg-white/[0.1] text-zinc-900 dark:text-zinc-50 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'ai' && <AiReportTab days={days} instanceId={selectedInstanceId} />}
      {activeTab === 'executive' && <ExecutiveReport days={days} instanceId={selectedInstanceId} />}
      {activeTab === 'attendants' && <AttendantsReport instanceId={selectedInstanceId} />}
      {activeTab === 'sla' && <SlaReport days={days} instanceId={selectedInstanceId} />}
      {activeTab === 'analysis' && <AnalysisReport instanceId={selectedInstanceId} />}
      {activeTab === 'volume' && <VolumeReport days={days} instanceId={selectedInstanceId} />}
      {activeTab === 'teams' && <TeamsReport instanceId={selectedInstanceId} />}
    </div>
  )
}
