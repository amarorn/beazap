'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'
import { instancesApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { selectedInstanceId, setSelectedInstanceId } = useInstance()
  const initialized = useRef(false)

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
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <Sidebar
        instances={instances}
        selectedInstanceId={selectedInstanceId}
        onInstanceChange={setSelectedInstanceId}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
