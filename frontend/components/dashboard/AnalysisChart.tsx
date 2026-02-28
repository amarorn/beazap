'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalysisStats } from '@/types'

const CATEGORY_COLORS: Record<string, string> = {
  reclamacao:       '#f87171',
  problema_tecnico: '#fb923c',
  nova_contratacao: '#34d399',
  suporte:          '#60a5fa',
  elogio:           '#4ade80',
  informacao:       '#a1a1aa',
  outro:            '#d4d4d8',
}

const SENTIMENT_CONFIG = {
  positivo: { label: 'Positivo', bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  neutro:   { label: 'Neutro',   bg: 'bg-zinc-100 dark:bg-zinc-700',          text: 'text-zinc-600 dark:text-zinc-300',       dot: 'bg-zinc-400' },
  negativo: { label: 'Negativo', bg: 'bg-red-100 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-400',          dot: 'bg-red-500' },
}

interface AnalysisChartProps {
  data: AnalysisStats
}

export function AnalysisChart({ data }: AnalysisChartProps) {
  if (data.total_analyzed === 0) {
    return (
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
            Análise IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">
            Nenhuma conversa analisada ainda
          </p>
        </CardContent>
      </Card>
    )
  }

  const stars = data.avg_satisfaction ? Math.round(data.avg_satisfaction) : 0

  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
            Análise IA
          </CardTitle>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {data.total_analyzed} conversa{data.total_analyzed !== 1 ? 's' : ''} analisada{data.total_analyzed !== 1 ? 's' : ''}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Category bar chart */}
        <ResponsiveContainer width="100%" height={data.categories.length * 36 + 8}>
          <BarChart
            data={data.categories}
            layout="vertical"
            barSize={14}
            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={110}
              tick={{ fontSize: 12, fill: '#71717a' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 12 }}
              cursor={{ fill: 'transparent' }}
              formatter={(value: number) => [value, 'conversas']}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.categories.map(cat => (
                <Cell
                  key={cat.key}
                  fill={CATEGORY_COLORS[cat.key] ?? '#a1a1aa'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Divider */}
        <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

        {/* Bottom row: sentiments + satisfaction */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Sentiments */}
          <div className="flex flex-wrap gap-2">
            {(['positivo', 'neutro', 'negativo'] as const).map(key => {
              const cfg = SENTIMENT_CONFIG[key]
              const count = data.sentiments[key] ?? 0
              return (
                <span
                  key={key}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label} <span className="font-bold">{count}</span>
                </span>
              )
            })}
          </div>

          {/* Avg satisfaction */}
          {data.avg_satisfaction && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400 dark:text-zinc-500">Satisfação média</span>
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
              </span>
              <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                {data.avg_satisfaction}/5
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
