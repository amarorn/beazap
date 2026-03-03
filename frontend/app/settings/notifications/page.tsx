'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell } from 'lucide-react'

const SLA_THRESHOLD_OPTIONS = [
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
]

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const [slaThreshold, setSlaThreshold] = useState(30)

  useEffect(() => {
    const stored = localStorage.getItem('sla_threshold_minutes')
    if (stored) setSlaThreshold(parseInt(stored, 10))
  }, [])

  function handleSlaThresholdChange(value: number) {
    setSlaThreshold(value)
    localStorage.setItem('sla_threshold_minutes', String(value))
    window.dispatchEvent(new Event('sla-threshold-changed'))
    queryClient.invalidateQueries({ queryKey: ['sla-alerts'] })
  }

  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base dark:text-zinc-100 flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-500" />
          Alertas de SLA
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Limiar de tempo sem primeira resposta para disparar um alerta.
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              Conversas abertas além deste tempo aparecerão em vermelho no dashboard e no sidebar.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {SLA_THRESHOLD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleSlaThresholdChange(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  slaThreshold === opt.value
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
