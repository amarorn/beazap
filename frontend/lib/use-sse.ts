'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8000`
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
}

export function useSseEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const es = new EventSource(`${getApiUrl()}/api/events`)

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { type: string; conversation_ids?: number[] }
        if (event.type === 'heartbeat') return

        if (event.type === 'new_message' || event.type === 'message_updated') {
          const ids = event.conversation_ids ?? []
          ids.forEach((id) => {
            queryClient.invalidateQueries({ queryKey: ['messages', id] })
            queryClient.invalidateQueries({ queryKey: ['conversation', id] })
          })
          if (ids.length === 0) {
            queryClient.invalidateQueries({ queryKey: ['messages'] })
          }
          queryClient.invalidateQueries({ queryKey: ['overview-comparison'] })
          queryClient.invalidateQueries({ queryKey: ['conversations'] })
          queryClient.invalidateQueries({ queryKey: ['conversations-recent'] })
          queryClient.invalidateQueries({ queryKey: ['sla-alerts'] })
          queryClient.invalidateQueries({ queryKey: ['extended-metrics'] })
          queryClient.invalidateQueries({ queryKey: ['attendants-metrics'] })
          queryClient.refetchQueries({ queryKey: ['messages'], type: 'active' })
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
