'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useTheme } from 'next-themes'
import type { DailyVolume } from '@/types'

interface VolumeChartProps {
  data: DailyVolume[]
}

export function VolumeChart({ data }: VolumeChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : '#e4e4e7'
  const tickColor = isDark ? '#71717a' : '#a1a1aa'
  const tooltipBg = isDark ? '#1a1f2e' : '#ffffff'
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.08)' : '#e4e4e7'
  const tooltipText = isDark ? '#e4e4e7' : '#18181b'
  const cursorFill = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'

  return (
    <div className="bg-white dark:bg-[oklch(0.15_0.018_260)] rounded-xl border border-zinc-200/80 dark:border-white/[0.07] shadow-sm p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Volume dos Últimos 7 Dias</h3>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Mensagens recebidas e enviadas</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barSize={12} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: `1px solid ${tooltipBorder}`,
              fontSize: 12,
              backgroundColor: tooltipBg,
              color: tooltipText,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            }}
            cursor={{ fill: cursorFill }}
          />
          <Legend
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
          />
          <Bar dataKey="inbound" name="Recebidas" fill="#10b981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="outbound" name="Enviadas" fill="#60a5fa" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
