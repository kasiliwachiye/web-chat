import { Menu, MessagesSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/hooks/useAuth'
import { useChat } from '@/hooks/useChat'
import { conversationTitle, lastSeen, otherMember } from '@/lib/format'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { UserAvatar } from './UserAvatar'

export function ChatPane({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const { user } = useAuth()
  const { conversations, activeId, presence, typing } = useChat()
  const me = user!.id
  const conversation = conversations.find((c) => c.id === activeId)

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
        <MessagesSquare className="size-10" />
        <p>Select a conversation or start a new one.</p>
      </div>
    )
  }

  const title = conversationTitle(conversation, me)
  const other = otherMember(conversation, me)
  const otherPresence = other ? presence[other.id] : undefined
  const typers = (typing[conversation.id] ?? []).filter((u) => u !== me)
  const typerNames = typers.map((id) => conversation.members.find((m) => m.id === id)?.displayName.split(' ')[0] ?? 'Someone')
  const onlineCount = conversation.members.filter((m) => m.id !== me && presence[m.id]?.online).length

  const subtitle = typers.length
    ? `${typerNames.join(', ')} ${typers.length > 1 ? 'are' : 'is'} typing…`
    : other
      ? otherPresence?.online
        ? 'Online'
        : lastSeen(otherPresence?.lastSeenAt ?? other.lastSeenAt)
      : `${conversation.members.length} members · ${onlineCount} online`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-3 py-2.5">
        {onOpenSidebar && (
          <Button variant="ghost" size="icon" onClick={onOpenSidebar} aria-label="Open conversations">
            <Menu className="size-5" />
          </Button>
        )}
        <UserAvatar name={title} online={other ? (otherPresence?.online ?? false) : undefined} group={!other} />
        <div className="min-w-0">
          <h2 className="truncate leading-tight font-semibold">{title}</h2>
          {conversation.type === 'GROUP' && !typers.length ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="cursor-default truncate text-xs text-muted-foreground">{subtitle}</p>
              </TooltipTrigger>
              <TooltipContent>{conversation.members.map((m) => m.displayName).join(', ')}</TooltipContent>
            </Tooltip>
          ) : (
            <p className={`truncate text-xs text-muted-foreground ${typers.length ? 'italic' : ''}`} aria-live="polite">
              {subtitle}
            </p>
          )}
        </div>
      </header>
      <MessageList conversation={conversation} meId={me} />
      <Composer conversationId={conversation.id} />
    </div>
  )
}
