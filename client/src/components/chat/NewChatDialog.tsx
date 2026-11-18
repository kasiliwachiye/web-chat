import { useEffect, useState } from 'react'
import { Check, MessageSquarePlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useChat } from '@/hooks/useChat'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { cn } from '@/lib/utils'
import { UserAvatar } from './UserAvatar'

type Mode = 'direct' | 'group'

export function NewChatDialog({ onCreated }: { onCreated?: () => void }) {
  const { upsertConversation, setActiveId, presence } = useChat()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('direct')
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<User[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      api
        .users(search)
        .then((r) => setUsers(r.users))
        .catch((e) => toast.error(`User search failed: ${(e as Error).message}`))
    }, 200)
    return () => clearTimeout(t)
  }, [search, open])

  const reset = () => {
    setMode('direct')
    setSearch('')
    setSelected([])
    setName('')
  }

  const finish = (id: string) => {
    setActiveId(id)
    setOpen(false)
    reset()
    onCreated?.()
  }

  const startDirect = async (u: User) => {
    setBusy(true)
    try {
      const { conversation } = await api.direct(u.id)
      upsertConversation(conversation)
      finish(conversation.id)
    } catch (e) {
      toast.error(`Could not start chat: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const createGroup = async () => {
    setBusy(true)
    try {
      const { conversation } = await api.group(name.trim(), selected.map((u) => u.id))
      upsertConversation(conversation)
      finish(conversation.id)
    } catch (e) {
      toast.error(`Could not create group: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (u: User) =>
    setSelected((s) => (s.some((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]))

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="New chat">
          <MessageSquarePlus className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'direct' ? 'New chat' : 'New group'}</DialogTitle>
          <DialogDescription>
            {mode === 'direct' ? 'Pick a colleague to message.' : 'Name the group and pick its members.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(['direct', 'group'] as const).map((m) => (
            <Button
              key={m}
              type="button"
              variant={mode === m ? 'secondary' : 'ghost'}
              size="sm"
              className={cn(mode === m && 'bg-background shadow-sm')}
              onClick={() => setMode(m)}
            >
              {m === 'direct' ? 'Direct message' : (
                <>
                  <Users className="size-4" /> Group
                </>
              )}
            </Button>
          ))}
        </div>

        {mode === 'group' && (
          <div className="grid gap-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Finance team"
              maxLength={80}
            />
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selected.map((u) => (
                  <Badge key={u.id} variant="secondary" className="cursor-pointer" onClick={() => toggle(u)}>
                    {u.displayName} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <Command shouldFilter={false} className="rounded-lg border">
          <CommandInput placeholder="Search people…" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-64">
            <CommandEmpty>No people found.</CommandEmpty>
            <CommandGroup>
              {users.map((u) => {
                const isSelected = selected.some((x) => x.id === u.id)
                return (
                  <CommandItem
                    key={u.id}
                    value={u.id}
                    disabled={busy}
                    onSelect={() => (mode === 'direct' ? startDirect(u) : toggle(u))}
                    className="gap-3"
                  >
                    <UserAvatar name={u.displayName} online={presence[u.id]?.online ?? u.online} className="[&_[data-slot=avatar]]:size-8" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{u.displayName}</div>
                      <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
                    </div>
                    {mode === 'group' && isSelected && <Check className="size-4" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>

        {mode === 'group' && (
          <DialogFooter>
            <Button onClick={createGroup} disabled={busy || !name.trim() || selected.length === 0}>
              Create group ({selected.length})
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
