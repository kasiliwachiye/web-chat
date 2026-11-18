import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ClientMessage, Conversation, Message, Presence } from '@/lib/types'
import { useAuth } from './useAuth'
import { useSocket } from './useSocket'

interface Thread {
  items: ClientMessage[]
  nextCursor: string | null
  loaded: boolean
  loadingOlder: boolean
}

interface ChatState {
  conversations: Conversation[]
  loadingConversations: boolean
  threads: Record<string, Thread>
  presence: Record<string, Presence>
  typing: Record<string, string[]>
  activeId: string | null
  setActiveId: (id: string | null) => void
  loadOlder: (conversationId: string) => Promise<void>
  send: (conversationId: string, body: string) => void
  retry: (msg: ClientMessage) => void
  setTyping: (conversationId: string, isTyping: boolean) => void
  upsertConversation: (c: Conversation) => void
}

const ChatContext = createContext<ChatState | null>(null)
const ACK_TIMEOUT_MS = 10_000
const PAGE = 30

const sortConvs = (cs: Conversation[]) => [...cs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
const sent = (m: Message): ClientMessage => ({ ...m, status: 'sent' })

/** Merge server messages into a thread, deduping by id and by clientMsgId (replaces optimistic copies). */
function mergeMessages(existing: ClientMessage[], incoming: ClientMessage[]): ClientMessage[] {
  const out = [...existing]
  for (const m of incoming) {
    const i = out.findIndex((x) => x.id === m.id || (x.clientMsgId === m.clientMsgId && x.senderId === m.senderId))
    if (i >= 0) out[i] = m
    else out.push(m)
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { socket } = useSocket()
  const me = user!.id

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [threads, setThreads] = useState<Record<string, Thread>>({})
  const [presence, setPresence] = useState<Record<string, Presence>>({})
  const [typing, setTypingState] = useState<Record<string, string[]>>({})
  const [activeId, setActiveIdState] = useState<string | null>(null)

  const activeRef = useRef<string | null>(null)
  const threadsRef = useRef(threads)
  threadsRef.current = threads
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const upsertConversation = useCallback((c: Conversation) => {
    setConversations((cs) => sortConvs([c, ...cs.filter((x) => x.id !== c.id)]))
    setPresence((p) => {
      const next = { ...p }
      for (const m of c.members) if (m.online !== undefined) next[m.id] = { online: m.online, lastSeenAt: m.lastSeenAt }
      return next
    })
  }, [])

  const loadConversations = useCallback(async () => {
    try {
      const { conversations } = await api.conversations()
      setConversations(sortConvs(conversations))
      const p: Record<string, Presence> = {}
      for (const c of conversations)
        for (const m of c.members) p[m.id] = { online: !!m.online, lastSeenAt: m.lastSeenAt }
      setPresence((prev) => ({ ...prev, ...p }))
    } catch (e) {
      toast.error(`Could not load conversations: ${(e as Error).message}`)
    } finally {
      setLoadingConversations(false)
    }
  }, [])

  const markRead = useCallback(
    (conversationId: string, messageId: string) => {
      if (!socket || messageId.startsWith('tmp-')) return
      socket.emit('conversation:read', { conversationId, messageId })
      setConversations((cs) => cs.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)))
    },
    [socket],
  )

  const loadLatest = useCallback(async (conversationId: string) => {
    const { messages, nextCursor } = await api.messages(conversationId, { limit: PAGE })
    setThreads((t) => ({
      ...t,
      [conversationId]: {
        items: mergeMessages(t[conversationId]?.items ?? [], messages.map(sent)),
        nextCursor,
        loaded: true,
        loadingOlder: false,
      },
    }))
    return messages
  }, [])

  const setActiveId = useCallback(
    (id: string | null) => {
      activeRef.current = id
      setActiveIdState(id)
      if (!id) return
      const existing = threadsRef.current[id]
      const p = existing?.loaded ? Promise.resolve(existing.items) : loadLatest(id)
      p.then((msgs) => {
        const last = [...msgs].reverse().find((m) => !m.id.startsWith('tmp-'))
        if (last) markRead(id, last.id)
      }).catch((e) => toast.error(`Could not load messages: ${(e as Error).message}`))
    },
    [loadLatest, markRead],
  )

  const loadOlder = useCallback(async (conversationId: string) => {
    const t = threadsRef.current[conversationId]
    if (!t?.nextCursor || t.loadingOlder) return
    setThreads((s) => ({ ...s, [conversationId]: { ...s[conversationId], loadingOlder: true } }))
    try {
      const { messages, nextCursor } = await api.messages(conversationId, { cursor: t.nextCursor, limit: PAGE })
      setThreads((s) => ({
        ...s,
        [conversationId]: {
          ...s[conversationId],
          items: mergeMessages(s[conversationId].items, messages.map(sent)),
          nextCursor,
          loadingOlder: false,
        },
      }))
    } catch (e) {
      setThreads((s) => ({ ...s, [conversationId]: { ...s[conversationId], loadingOlder: false } }))
      toast.error(`Could not load history: ${(e as Error).message}`)
    }
  }, [])

  const applyIncoming = useCallback(
    (m: Message) => {
      setThreads((t) => {
        const thread = t[m.conversationId]
        if (!thread) return t // not opened yet; will load from REST when opened
        return { ...t, [m.conversationId]: { ...thread, items: mergeMessages(thread.items, [sent(m)]) } }
      })
      setConversations((cs) => {
        const isActive = activeRef.current === m.conversationId && document.visibilityState === 'visible'
        return sortConvs(
          cs.map((c) =>
            c.id === m.conversationId
              ? {
                  ...c,
                  lastMessage: m,
                  updatedAt: m.createdAt,
                  unreadCount: m.senderId !== me && !isActive ? c.unreadCount + 1 : c.unreadCount,
                }
              : c,
          ),
        )
      })
    },
    [me],
  )

  const emitSend = useCallback(
    (msg: ClientMessage) => {
      if (!socket) return
      socket
        .timeout(ACK_TIMEOUT_MS)
        .emit(
          'message:send',
          { conversationId: msg.conversationId, body: msg.body, clientMsgId: msg.clientMsgId },
          (err: Error | null, res: { ok: boolean; message?: Message; error?: string }) => {
            if (err || !res?.ok || !res.message) {
              setThreads((t) => ({
                ...t,
                [msg.conversationId]: {
                  ...t[msg.conversationId],
                  items: t[msg.conversationId].items.map((x) =>
                    x.clientMsgId === msg.clientMsgId ? { ...x, status: 'failed' } : x,
                  ),
                },
              }))
              toast.error(`Message not sent: ${err ? 'timed out' : res?.error ?? 'unknown error'}`)
              return
            }
            applyIncoming(res.message)
          },
        )
    },
    [socket, applyIncoming],
  )

  const send = useCallback(
    (conversationId: string, body: string) => {
      const clientMsgId = crypto.randomUUID()
      const optimistic: ClientMessage = {
        id: `tmp-${clientMsgId}`,
        conversationId,
        senderId: me,
        body,
        clientMsgId,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        status: 'pending',
      }
      setThreads((t) => {
        const thread = t[conversationId] ?? { items: [], nextCursor: null, loaded: true, loadingOlder: false }
        return { ...t, [conversationId]: { ...thread, items: [...thread.items, optimistic] } }
      })
      emitSend(optimistic)
    },
    [me, emitSend],
  )

  const retry = useCallback(
    (msg: ClientMessage) => {
      setThreads((t) => ({
        ...t,
        [msg.conversationId]: {
          ...t[msg.conversationId],
          items: t[msg.conversationId].items.map((x) =>
            x.clientMsgId === msg.clientMsgId ? { ...x, status: 'pending' } : x,
          ),
        },
      }))
      emitSend(msg) // same clientMsgId -> server dedups if the first attempt was actually stored
    },
    [emitSend],
  )

  const setTyping = useCallback(
    (conversationId: string, isTyping: boolean) => {
      socket?.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId })
    },
    [socket],
  )

  // Socket event wiring
  useEffect(() => {
    if (!socket) return

    const onNew = ({ message }: { message: Message }) => {
      applyIncoming(message)
      if (message.senderId !== me && activeRef.current === message.conversationId && document.visibilityState === 'visible')
        markRead(message.conversationId, message.id)
      // Clear typing for that sender once their message lands.
      setTypingState((t) => ({
        ...t,
        [message.conversationId]: (t[message.conversationId] ?? []).filter((u) => u !== message.senderId),
      }))
    }
    const onPresence = (p: { userId: string; online: boolean; lastSeenAt: string | null }) =>
      setPresence((s) => ({ ...s, [p.userId]: { online: p.online, lastSeenAt: p.lastSeenAt ?? s[p.userId]?.lastSeenAt ?? null } }))
    const onTyping = ({ conversationId, userId, isTyping }: { conversationId: string; userId: string; isTyping: boolean }) => {
      const key = `${conversationId}:${userId}`
      clearTimeout(typingTimers.current[key])
      setTypingState((t) => {
        const cur = (t[conversationId] ?? []).filter((u) => u !== userId)
        return { ...t, [conversationId]: isTyping ? [...cur, userId] : cur }
      })
      if (isTyping)
        typingTimers.current[key] = setTimeout(
          () => setTypingState((t) => ({ ...t, [conversationId]: (t[conversationId] ?? []).filter((u) => u !== userId) })),
          5000,
        )
    }
    const onConvNew = ({ conversation }: { conversation: Conversation }) => upsertConversation(conversation)
    const onRead = ({ conversationId }: { conversationId: string }) =>
      setConversations((cs) => cs.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)))

    // On (re)connect: refetch the conversation list and backfill every open thread after its last known id.
    const onConnect = async () => {
      await loadConversations()
      for (const [cid, thread] of Object.entries(threadsRef.current)) {
        const lastKnown = [...thread.items].reverse().find((m) => m.status === 'sent')
        try {
          if (!lastKnown) {
            await loadLatest(cid)
            continue
          }
          const { messages } = await api.messages(cid, { after: lastKnown.id, limit: 100 })
          messages.forEach(applyIncoming)
          // Resend anything still pending from before the disconnect (dedup makes this safe).
          thread.items.filter((m) => m.status === 'pending').forEach(emitSend)
        } catch {
          /* best effort; the user can reopen the conversation */
        }
      }
      if (activeRef.current) {
        const items = threadsRef.current[activeRef.current]?.items ?? []
        const last = [...items].reverse().find((m) => m.status === 'sent')
        if (last) markRead(activeRef.current, last.id)
      }
    }

    socket.on('message:new', onNew)
    socket.on('presence:update', onPresence)
    socket.on('typing', onTyping)
    socket.on('conversation:new', onConvNew)
    socket.on('conversation:read', onRead)
    socket.on('connect', onConnect)
    if (socket.connected) void onConnect()
    else void loadConversations()
    return () => {
      socket.off('message:new', onNew)
      socket.off('presence:update', onPresence)
      socket.off('typing', onTyping)
      socket.off('conversation:new', onConvNew)
      socket.off('conversation:read', onRead)
      socket.off('connect', onConnect)
    }
  }, [socket, me, applyIncoming, markRead, loadConversations, loadLatest, emitSend, upsertConversation])

  return (
    <ChatContext.Provider
      value={{
        conversations,
        loadingConversations,
        threads,
        presence,
        typing,
        activeId,
        setActiveId,
        loadOlder,
        send,
        retry,
        setTyping,
        upsertConversation,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used inside ChatProvider')
  return ctx
}
