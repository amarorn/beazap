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
import type { HourlyVolume } from '@/types'

interface PeakHoursChartProps {
  data: HourlyVolume[]
}

export function PeakHoursChart({ data }: PeakHoursChartProps) {
  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
          Horário de Pico
        </CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Mensagens por hora do dia (últimos 7 dias)
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} barSize={8} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#71717a' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e4e4e7',
                fontSize: 12,
              }}
              cursor={{ fill: '#f4f4f5' }}
              formatter={(value: number) => [value, 'Mensagens']}
              labelFormatter={(label) => `Horário: ${label}`}
            />
            <Bar dataKey="count" name="Mensagens" fill="#10b981" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
