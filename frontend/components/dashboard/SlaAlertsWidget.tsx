'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { metricsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, CheckCircle2, Clock, MessageSquare } from 'lucide-react'
import type { SlaAlertEntry } from '@/types'

function formatWait(seconds: number) {
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    return `${m}min`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function useSlaThreshold(): number {
  const [threshold, setThreshold] = useState(30)
  useEffect(() => {
    const stored = localStorage.getItem('sla_threshold_minutes')
    if (stored) setThreshold(parseInt(stored, 10))
    const handler = () => {
      const updated = localStorage.getItem('sla_threshold_minutes')
      if (updated) setThreshold(parseInt(updated, 10))
    }
    window.addEventListener('sla-threshold-changed', handler)
    return () => window.removeEventListener('sla-threshold-changed', handler)
  }, [])
  return threshold
}

export function SlaAlertsWidget() {
  const { selectedInstanceId } = useInstance()
  const threshold = useSlaThreshold()

  const { data, isLoading } = useQuery({
    queryKey: ['sla-alerts', selectedInstanceId, threshold],
    queryFn: () =>
      metricsApi.getSlaAlerts({
        instance_id: selectedInstanceId,
        threshold_minutes: threshold,
      }),
    refetchInterval: 60_000,
  })

  const alerts = data?.alerts ?? []
  const count = data?.count ?? 0

  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Alertas de SLA
          </CardTitle>
          {count > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold">
              {count}
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          Limiar: {threshold}min
        </span>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 py-4 text-center">
            Carregando...
          </p>
        )}

        {!isLoading && count === 0 && (
          <div className="flex items-center gap-2 py-4 justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">Nenhum alerta — SLA em dia</span>
          </div>
        )}

        {!isLoading && count > 0 && (
          <div className="divide-y divide-zinc-50 dark:divide-zinc-800">
            {alerts.map((alert: SlaAlertEntry) => {
              const isCritical = alert.wait_seconds >= threshold * 60 * 2
              return (
                <div
                  key={alert.id}
                  className="flex items-center justify-between py-2.5 gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {alert.contact_name || alert.contact_phone}
                    </p>
                    {alert.contact_name && (
                      <p className="text-[10px] font-mono text-zinc-400">
                        {alert.contact_phone}
                      </p>
                    )}
                    {alert.attendant_name && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        {alert.attendant_name}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div
                      className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md ${
                        isCritical
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {formatWait(alert.wait_seconds)}
                    </div>

                    <Link href={`/conversations/${alert.id}`}>
                      <button className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 px-2 py-1.5 rounded-md transition-colors">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ver
                      </button>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
