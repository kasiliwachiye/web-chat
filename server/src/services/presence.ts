/**
 * Presence tracking. In-memory implementation counts sockets per user so that
 * multiple tabs/devices work: a user is offline only when the last socket closes.
 * Swap for a Redis implementation (HINCRBY per node + TTL heartbeat) when scaling out.
 */
export interface PresenceStore {
  /** Returns true if this connection made the user go online. */
  connect(userId: string): Promise<boolean>;
  /** Returns true if this disconnection made the user go offline. */
  disconnect(userId: string): Promise<boolean>;
  isOnline(userId: string): Promise<boolean>;
  onlineSet(userIds: string[]): Promise<Set<string>>;
}

export class InMemoryPresenceStore implements PresenceStore {
  private counts = new Map<string, number>();

  async connect(userId: string) {
    const n = (this.counts.get(userId) ?? 0) + 1;
    this.counts.set(userId, n);
    return n === 1;
  }

  async disconnect(userId: string) {
    const n = (this.counts.get(userId) ?? 0) - 1;
    if (n <= 0) {
      this.counts.delete(userId);
      return true;
    }
    this.counts.set(userId, n);
    return false;
  }

  async isOnline(userId: string) {
    return this.counts.has(userId);
  }

  async onlineSet(userIds: string[]) {
    return new Set(userIds.filter((id) => this.counts.has(id)));
  }
}

export const presence: PresenceStore = new InMemoryPresenceStore();
