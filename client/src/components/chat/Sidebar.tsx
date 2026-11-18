import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useChat } from '@/hooks/useChat'
import { conversationTitle } from '@/lib/format'
import { ConversationItem } from './ConversationItem'
import { NewChatDialog } from './NewChatDialog'
import { UserMenu } from './UserMenu'

/** Conversation list. Rendered as a column on desktop and inside a Sheet (or full screen) on mobile. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  const { conversations, loadingConversations, activeId, setActiveId, presence, typing } = useChat()
  const [filter, setFilter] = useState('')
  const me = user!.id
  const visible = conversations.filter((c) => conversationTitle(c, me).toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-2 p-3">
        <UserMenu />
        <NewChatDialog onCreated={onNavigate} />
      </div>
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter conversations"
            className="pl-8"
            aria-label="Filter conversations"
          />
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <nav className="flex flex-col gap-0.5 p-2" aria-label="Conversations">
          {loadingConversations &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          {!loadingConversations && visible.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {filter ? 'No matches.' : 'No conversations yet. Start one with the + button.'}
            </p>
          )}
          {visible.map((c) => (
            <ConversationItem
              key={c.id}
              conversation={c}
              meId={me}
              active={c.id === activeId}
              presence={presence}
              typing={(typing[c.id] ?? []).filter((u) => u !== me)}
              onSelect={() => {
                setActiveId(c.id)
                onNavigate?.()
              }}
            />
          ))}
        </nav>
      </ScrollArea>
    </div>
  )
}
