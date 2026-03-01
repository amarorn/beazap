'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'
import { instancesApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { useSseEvents } from '@/lib/use-sse'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { selectedInstanceId, setSelectedInstanceId } = useInstance()
  const initialized = useRef(false)

  useSseEvents()

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesApi.list,
  })

  useEffect(() => {
    if (instances.length > 0 && !initialized.current) {
      setSelectedInstanceId(instances[0].id)
      initialized.current = true
    }
  }, [instances, setSelectedInstanceId])

  return (
    <div className="flex h-screen overflow-hidden bg-[oklch(0.975_0.002_260)] dark:bg-[oklch(0.1_0.018_260)]">
      <Sidebar
        instances={instances}
        selectedInstanceId={selectedInstanceId}
        onInstanceChange={setSelectedInstanceId}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
