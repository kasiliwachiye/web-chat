import { AlertCircle, Check, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ClientMessage } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  message: ClientMessage
  mine: boolean
  senderName?: string
  showSender: boolean
  onRetry: () => void
}

export function MessageBubble({ message: m, mine, senderName, showSender, onRetry }: Props) {
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {showSender && senderName && <span className="mb-0.5 px-3 text-xs text-muted-foreground">{senderName}</span>}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[65%]',
          mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted text-foreground',
          m.status === 'pending' && 'opacity-70',
          m.status === 'failed' && 'ring-2 ring-destructive',
        )}
      >
        {/* Plain text rendering only: React escapes it. Never dangerouslySetInnerHTML. */}
        <p className="break-words whitespace-pre-wrap">{m.deletedAt ? <em>message deleted</em> : m.body}</p>
        <div
          className={cn(
            'mt-0.5 flex items-center justify-end gap-1 text-[10px]',
            mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          <span>{time}</span>
          {mine && m.status === 'pending' && <Clock className="size-3" aria-label="sending" />}
          {mine && m.status === 'sent' && <Check className="size-3" aria-label="sent" />}
          {mine && m.status === 'failed' && <AlertCircle className="size-3" aria-label="failed" />}
        </div>
      </div>
      {m.status === 'failed' && (
        <Button variant="link" size="sm" className="h-auto px-3 py-0.5 text-xs text-destructive" onClick={onRetry}>
          Not sent. Tap to retry
        </Button>
      )}
    </div>
  )
}
