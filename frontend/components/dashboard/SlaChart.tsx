'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DailySla } from '@/types'
import { formatResponseTime } from '@/lib/utils'

interface SlaChartProps {
  data: DailySla[]
}

function formatSecondsForAxis(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  return `${(seconds / 3600).toFixed(1)}h`
}

export function SlaChart({ data }: SlaChartProps) {
  const chartData = data.map(d => ({
    ...d,
    displayValue: d.avg_response_seconds ?? 0,
  }))

  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
          Tempo até 1ª Resposta (SLA)
        </CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Média do tempo entre mensagem do cliente e primeira resposta — últimos 7 dias
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barSize={14} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" className="dark:stroke-zinc-700" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 12, fill: '#71717a' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatSecondsForAxis}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 12 }}
              cursor={{ fill: '#f4f4f5' }}
              formatter={(value: number | undefined, _name, props: { payload?: DailySla }) => [
                (props.payload?.count ?? 0) > 0 ? formatResponseTime(value ?? 0) : '—',
                `Média (${props.payload?.count ?? 0} atendimento${(props.payload?.count ?? 0) !== 1 ? 's' : ''})`,
              ]}
              labelFormatter={label => `Dia ${label}`}
            />
            <Bar dataKey="displayValue" name="Tempo médio" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
