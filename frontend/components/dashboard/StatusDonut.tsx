'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { OverviewMetrics } from '@/types'

const COLORS = ['#fbbf24', '#60a5fa', '#10b981', '#f87171']

interface StatusDonutProps {
  data: OverviewMetrics
}

export function StatusDonut({ data }: StatusDonutProps) {
  const allStatuses = [
    { name: 'Esperando atendimento', value: data.waiting_conversations },
    { name: 'Em atendimento', value: data.in_progress_conversations },
    { name: 'Concluído', value: data.resolved_conversations },
    { name: 'Abandonado', value: data.abandoned_conversations },
  ]
  const chartData = allStatuses.filter(d => d.value > 0)
  const total = data.total_conversations
  const displayData = chartData.length > 0 ? chartData : [{ name: 'Nenhum', value: 1 }]

  return (
    <Card className="border-zinc-100 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-800">
          Status dos Atendimentos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={displayData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {displayData.map((_, index) => (
                  <Cell key={index} fill={chartData.length > 0 ? COLORS[index % COLORS.length] : '#e4e4e7'} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-zinc-900">{total}</span>
            <span className="text-xs text-zinc-400">total</span>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {allStatuses.map((item, i) => (
            <div key={item.name} className="flex justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLORS[i] }} />
                <span className="text-zinc-600">{item.name}</span>
              </span>
              <span className="font-semibold text-zinc-800">{item.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
