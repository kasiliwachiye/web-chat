import { useState } from 'react'
import { ChatPane } from '@/components/chat/ChatPane'
import { Sidebar } from '@/components/chat/Sidebar'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useAuth } from '@/hooks/useAuth'
import { ChatProvider, useChat } from '@/hooks/useChat'
import { useIsMobile } from '@/hooks/useIsMobile'
import { SocketProvider } from '@/hooks/useSocket'

function Layout() {
  const isMobile = useIsMobile()
  const { activeId } = useChat()
  const [sheetOpen, setSheetOpen] = useState(false)

  if (!isMobile) {
    return (
      <div className="grid h-dvh grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr]">
        <aside className="min-h-0 border-r">
          <Sidebar />
        </aside>
        <main className="min-h-0">
          <ChatPane />
        </main>
      </div>
    )
  }

  // Mobile: list view until a conversation is picked, then the chat with the list in a Sheet.
  if (!activeId) {
    return (
      <div className="h-dvh">
        <Sidebar />
      </div>
    )
  }
  return (
    <div className="h-dvh">
      <ChatPane onOpenSidebar={() => setSheetOpen(true)} />
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-sm p-0 [&>button]:hidden">
          <SheetTitle className="sr-only">Conversations</SheetTitle>
          <SheetDescription className="sr-only">Your conversations</SheetDescription>
          <Sidebar onNavigate={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default function ChatPage() {
  const { token } = useAuth()
  return (
    <SocketProvider token={token!}>
      <ChatProvider>
        <Layout />
      </ChatProvider>
    </SocketProvider>
  )
}
