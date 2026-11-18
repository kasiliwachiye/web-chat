import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { toast } from 'sonner'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? undefined // same origin (proxied by Vite)

interface SocketState {
  socket: Socket | null
  connected: boolean
}

const SocketContext = createContext<SocketState>({ socket: null, connected: false })

export function SocketProvider({ token, children }: { token: string; children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const s = io(SOCKET_URL, {
      withCredentials: true,
      auth: { token },
      transports: ['websocket'],
      reconnectionDelayMax: 5000,
    })
    let wasConnected = false
    s.on('connect', () => {
      setConnected(true)
      if (wasConnected) toast.success('Back online', { id: 'conn' })
      wasConnected = true
    })
    s.on('disconnect', (reason) => {
      setConnected(false)
      if (reason !== 'io client disconnect') toast.loading('Reconnecting…', { id: 'conn' })
    })
    s.on('connect_error', (err) => {
      setConnected(false)
      if (wasConnected) toast.loading('Reconnecting…', { id: 'conn' })
      else if (err.message === 'unauthorized') toast.error('Session expired, please sign in again')
    })
    setSocket(s)
    return () => {
      s.removeAllListeners()
      s.disconnect()
      toast.dismiss('conn')
    }
  }, [token])

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>
}

export const useSocket = () => useContext(SocketContext)
