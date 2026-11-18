import { useEffect, useLayoutEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useChat } from '@/hooks/useChat'
import type { Conversation } from '@/lib/types'
import { MessageBubble } from './MessageBubble'

interface Props {
  conversation: Conversation
  meId: string
}

/** Message history with infinite scroll up (keyset cursor) and auto-scroll to bottom on new messages. */
export function MessageList({ conversation, meId }: Props) {
  const { threads, loadOlder, retry } = useChat()
  const thread = threads[conversation.id]
  const items = thread?.items ?? []
  const rootRef = useRef<HTMLDivElement>(null)
  const viewport = () => rootRef.current?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]') ?? null

  const prevFirstId = useRef<string | undefined>(undefined)
  const prevLastId = useRef<string | undefined>(undefined)
  const prevHeight = useRef(0)
  const nearBottom = useRef(true)

  // Keep the scroll position stable when older messages are prepended; stick to bottom for new ones.
  useLayoutEffect(() => {
    const vp = viewport()
    if (!vp) return
    const firstId = items[0]?.id
    const last = items[items.length - 1]
    if (prevFirstId.current && firstId !== prevFirstId.current && last?.id === prevLastId.current) {
      vp.scrollTop += vp.scrollHeight - prevHeight.current
    } else if (last?.id !== prevLastId.current && (nearBottom.current || last?.senderId === meId || !prevLastId.current)) {
      vp.scrollTop = vp.scrollHeight
    }
    prevFirstId.current = firstId
    prevLastId.current = last?.id
    prevHeight.current = vp.scrollHeight
  })

  // Reset per-conversation scroll bookkeeping.
  useEffect(() => {
    prevFirstId.current = undefined
    prevLastId.current = undefined
    nearBottom.current = true
  }, [conversation.id])

  useEffect(() => {
    const vp = viewport()
    if (!vp) return
    const onScroll = () => {
      nearBottom.current = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 80
      if (vp.scrollTop < 60) void loadOlder(conversation.id)
    }
    vp.addEventListener('scroll', onScroll, { passive: true })
    return () => vp.removeEventListener('scroll', onScroll)
  }, [conversation.id, loadOlder, thread?.loaded])

  const nameOf = (id: string) => conversation.members.find((m) => m.id === id)?.displayName ?? 'Unknown'

  return (
    <ScrollArea ref={rootRef} className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
      <div className="flex flex-col gap-1.5 px-3 py-4 sm:px-6" role="log" aria-live="polite" aria-label="Messages">
        {!thread?.loaded &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={i % 2 ? 'flex justify-end' : 'flex'}>
              <Skeleton className="h-10 w-48 rounded-2xl" />
            </div>
          ))}
        {thread?.loadingOlder && <Skeleton className="mx-auto h-4 w-32" />}
        {thread?.loaded && !thread.nextCursor && items.length > 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">Beginning of conversation</p>
        )}
        {thread?.loaded && items.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hello 👋</p>
        )}
        {items.map((m, i) => (
          <MessageBubble
            key={m.clientMsgId}
            message={m}
            mine={m.senderId === meId}
            senderName={nameOf(m.senderId)}
            showSender={conversation.type === 'GROUP' && m.senderId !== meId && items[i - 1]?.senderId !== m.senderId}
            onRetry={() => retry(m)}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
