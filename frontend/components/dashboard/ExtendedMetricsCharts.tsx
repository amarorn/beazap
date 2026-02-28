'use client'

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DailyExtendedMetrics } from '@/types'
import { formatResponseTime } from '@/lib/utils'

interface ExtendedMetricsChartsProps {
  data: DailyExtendedMetrics[]
}

function formatSeconds(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  return `${(seconds / 3600).toFixed(1)}h`
}

export function ExtendedMetricsCharts({ data }: ExtendedMetricsChartsProps) {
  const chartData = data.map(d => ({
    ...d,
    resolution: d.avg_resolution_seconds ?? 0,
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
            SLA e Taxa de Abandono
          </CardTitle>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            % de conversas com 1ª resposta no prazo — últimos 7 dias
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 12 }}
                formatter={(value: number | undefined, name: string | undefined) => [
                  String(name ?? '').startsWith('SLA') ? `${value ?? 0}%` : `${value ?? 0}%`,
                  String(name ?? ''),
                ]}
                labelFormatter={label => `Dia ${label}`}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="abandonment_rate"
                name="Abandono"
                fill="#f87171"
                radius={[2, 2, 0, 0]}
                barSize={12}
              />
              <Line
                type="monotone"
                dataKey="sla_5min_rate"
                name="SLA 5 min"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="sla_15min_rate"
                name="SLA 15 min"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="sla_30min_rate"
                name="SLA 30 min"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
            Tempo Médio de Resolução
          </CardTitle>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Abertura até conclusão por dia — últimos 7 dias
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => formatSeconds(v)}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 12 }}
                formatter={(value: number | undefined) => [
                  (value ?? 0) > 0 ? formatResponseTime(value ?? 0) : '—',
                  'Tempo médio',
                ]}
                labelFormatter={label => `Dia ${label}`}
              />
              <Bar
                dataKey="resolution"
                name="Tempo médio"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                barSize={24}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
