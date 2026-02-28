'use client'

import { createContext, useContext, useState } from 'react'

interface InstanceContextType {
  selectedInstanceId: number | undefined
  setSelectedInstanceId: (id: number | undefined) => void
}

const InstanceContext = createContext<InstanceContextType>({
  selectedInstanceId: undefined,
  setSelectedInstanceId: () => {},
})

export function InstanceProvider({ children }: { children: React.ReactNode }) {
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | undefined>()
  return (
    <InstanceContext.Provider value={{ selectedInstanceId, setSelectedInstanceId }}>
      {children}
    </InstanceContext.Provider>
  )
}

export function useInstance() {
  return useContext(InstanceContext)
}
