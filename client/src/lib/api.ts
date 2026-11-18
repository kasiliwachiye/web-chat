import type { Conversation, Message, User } from './types'

export const API_URL = import.meta.env.VITE_API_URL ?? '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText)
  return data as T
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username: string, displayName: string, password: string) =>
    request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User; token: string }>('/auth/me'),
  users: (search = '') => request<{ users: User[] }>(`/users?search=${encodeURIComponent(search)}`),
  conversations: () => request<{ conversations: Conversation[] }>('/conversations'),
  direct: (userId: string) =>
    request<{ conversation: Conversation }>('/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  group: (name: string, memberIds: string[]) =>
    request<{ conversation: Conversation }>('/conversations/group', {
      method: 'POST',
      body: JSON.stringify({ name, memberIds }),
    }),
  messages: (id: string, opts: { cursor?: string; after?: string; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (opts.cursor) q.set('cursor', opts.cursor)
    if (opts.after) q.set('after', opts.after)
    q.set('limit', String(opts.limit ?? 30))
    return request<{ messages: Message[]; nextCursor: string | null }>(`/conversations/${id}/messages?${q}`)
  },
}
