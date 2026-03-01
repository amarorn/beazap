'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export function useSseEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const es = new EventSource(`${API_URL}/api/events`)

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { type: string }
        if (event.type === 'heartbeat') return

        if (event.type === 'new_message' || event.type === 'message_updated') {
          queryClient.invalidateQueries({ queryKey: ['overview-comparison'] })
          queryClient.invalidateQueries({ queryKey: ['conversations'] })
          queryClient.invalidateQueries({ queryKey: ['conversations-recent'] })
          queryClient.invalidateQueries({ queryKey: ['sla-alerts'] })
          queryClient.invalidateQueries({ queryKey: ['extended-metrics'] })
          queryClient.invalidateQueries({ queryKey: ['attendants-metrics'] })
        }

        if (event.type === 'groups_updated') {
          queryClient.invalidateQueries({ queryKey: ['groups'] })
          queryClient.invalidateQueries({ queryKey: ['groups-overview'] })
        }

        if (event.type === 'new_call') {
          queryClient.invalidateQueries({ queryKey: ['calls'] })
        }
      } catch {
        // ignore JSON parse errors
      }
    }

    return () => es.close()
  }, [queryClient])
}
