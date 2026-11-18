import { Badge } from '@/components/ui/badge'
import { conversationTitle, formatTime, otherMember } from '@/lib/format'
import type { Conversation, Presence } from '@/lib/types'
import { cn } from '@/lib/utils'
import { UserAvatar } from './UserAvatar'

interface Props {
  conversation: Conversation
  meId: string
  active: boolean
  presence: Record<string, Presence>
  typing: string[]
  onSelect: () => void
}

export function ConversationItem({ conversation: c, meId, active, presence, typing, onSelect }: Props) {
  const title = conversationTitle(c, meId)
  const other = otherMember(c, meId)
  const online = other ? (presence[other.id]?.online ?? false) : undefined
  const last = c.lastMessage
  const senderName = last && c.type === 'GROUP' ? c.members.find((m) => m.id === last.senderId)?.displayName.split(' ')[0] : null
  const preview = typing.length
    ? 'typing…'
    : last
      ? `${last.senderId === meId ? 'You: ' : senderName ? `${senderName}: ` : ''}${last.body}`
      : 'No messages yet'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        active && 'bg-accent',
      )}
      aria-current={active ? 'true' : undefined}
    >
      <UserAvatar name={title} online={online} group={c.type === 'GROUP'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{title}</span>
          {last && <span className="shrink-0 text-xs text-muted-foreground">{formatTime(last.createdAt)}</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-sm text-muted-foreground', typing.length > 0 && 'italic')}>{preview}</span>
          {c.unreadCount > 0 && (
            <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-full px-1.5 tabular-nums">
              {c.unreadCount > 99 ? '99+' : c.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </button>
  )
}
