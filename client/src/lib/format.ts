import type { Conversation, User } from './types'

export function conversationTitle(c: Conversation, meId: string): string {
  if (c.type === 'GROUP') return c.name ?? 'Group'
  return c.members.find((m) => m.id !== meId)?.displayName ?? 'Direct message'
}

export function otherMember(c: Conversation, meId: string): User | undefined {
  return c.type === 'DIRECT' ? c.members.find((m) => m.id !== meId) : undefined
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function lastSeen(iso: string | null): string {
  if (!iso) return 'offline'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'last seen just now'
  if (mins < 60) return `last seen ${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `last seen ${hrs}h ago`
  return `last seen ${new Date(iso).toLocaleDateString()}`
}
