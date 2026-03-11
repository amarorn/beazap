'use client'

import { ConversationsSidebar } from '@/components/conversations/ConversationsSidebar'

export default function ConversationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex -m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <ConversationsSidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  )
}
