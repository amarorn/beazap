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
import type { DailyStatus } from '@/types'

interface StatusChartProps {
  data: DailyStatus[]
}

export function StatusChart({ data }: StatusChartProps) {
  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
          Chamados por Status
        </CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Abertos no dia (barra), em atendimento e esperando atendimento (linhas) — últimos 7 dias
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} barSize={24} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" className="dark:stroke-zinc-700" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 12 }}
              cursor={{ fill: '#f4f4f5' }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="opened" name="Abertos no dia" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="in_progress"
              name="Em atendimento"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={{ fill: '#60a5fa', r: 4 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="waiting"
              name="Esperando atendimento"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ fill: '#f59e0b', r: 4 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
