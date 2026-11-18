import { Users } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  name: string
  online?: boolean
  group?: boolean
  className?: string
}

/** Avatar with initials and an online (green) / offline (grey) dot. Groups show an icon and no dot. */
export function UserAvatar({ name, online, group, className }: Props) {
  return (
    <div className={cn('relative shrink-0', className)}>
      <Avatar className="size-10">
        <AvatarFallback className="bg-secondary text-secondary-foreground text-sm font-medium">
          {group ? <Users className="size-4" aria-hidden /> : initials(name)}
        </AvatarFallback>
      </Avatar>
      {!group && online !== undefined && (
        <span
          className={cn(
            'absolute right-0 bottom-0 size-3 rounded-full ring-2 ring-background',
            online ? 'bg-green-500' : 'bg-muted-foreground/40',
          )}
          aria-label={online ? 'online' : 'offline'}
          role="img"
        />
      )}
    </div>
  )
}
