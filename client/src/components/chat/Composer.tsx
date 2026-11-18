import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChat } from '@/hooks/useChat'

const MAX = 4000
const TYPING_IDLE_MS = 2000

export function Composer({ conversationId }: { conversationId: string }) {
  const { send, setTyping } = useChat()
  const [text, setText] = useState('')
  const typingRef = useRef(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  const stopTyping = () => {
    clearTimeout(idleTimer.current)
    if (typingRef.current) {
      typingRef.current = false
      setTyping(conversationId, false)
    }
  }

  useEffect(() => {
    setText('')
    inputRef.current?.focus()
    return stopTyping
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const onChange = (v: string) => {
    setText(v)
    if (!typingRef.current && v.trim()) {
      typingRef.current = true
      setTyping(conversationId, true)
    }
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    send(conversationId, body)
    setText('')
    stopTyping()
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t bg-background p-3">
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a message…"
        maxLength={MAX}
        aria-label="Message"
        autoComplete="off"
        className="flex-1"
      />
      <Button type="submit" size="icon" disabled={!text.trim()} aria-label="Send">
        <SendHorizontal className="size-4" />
      </Button>
    </form>
  )
}
