export interface User {
  id: string
  username: string
  displayName: string
  lastSeenAt: string | null
  online?: boolean
}

export interface Member extends User {
  role: 'OWNER' | 'MEMBER'
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  body: string
  clientMsgId: string
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
}

export type MessageStatus = 'pending' | 'sent' | 'failed'
export interface ClientMessage extends Message {
  status: MessageStatus
}

export interface Conversation {
  id: string
  type: 'DIRECT' | 'GROUP'
  name: string | null
  createdBy: string
  updatedAt: string
  members: Member[]
  lastMessage: Message | null
  lastReadMessageId: string | null
  unreadCount: number
}

export interface Presence {
  online: boolean
  lastSeenAt: string | null
}
