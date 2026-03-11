'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { getApiBaseUrl } from '@/lib/api-url'

const RECONNECT_MS = 3000

export function useSseEvents() {
  const queryClient = useQueryClient()
  const esRef = useRef<EventSource | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const url = `${getApiBaseUrl()}/api/events`

    function attachHandlers(es: EventSource) {
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

      es.onerror = () => {
        es.close()
        esRef.current = null
        if (reconnectRef.current) return
        reconnectRef.current = setTimeout(() => {
          reconnectRef.current = null
          connect()
        }, RECONNECT_MS)
      }
    }

    function connect() {
      if (esRef.current) return
      const es = new EventSource(url)
      esRef.current = es
      attachHandlers(es)
    }

    connect()

    return () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [queryClient])
}
