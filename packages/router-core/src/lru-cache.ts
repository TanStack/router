export type LRUCache<T> = {
  get: (key: string) => T | undefined
  set: (key: string, value: T) => void
}

export function createLRUCache<T>(max: number): LRUCache<T> {
  type Node = { prev?: Node; next?: Node; key: string, value: T }
  const cache = new Map<string, Node>()
  let oldest: Node | undefined
  let newest: Node | undefined

  const touch = (entry: Node) => {
    if (!entry.next) return
    if (!entry.prev) {
      entry.next.prev = undefined
      oldest = entry.next
      entry.next = undefined
      if (newest) {
        entry.prev = newest
        newest.next = entry
      }
    } else {
      entry.prev.next = entry.next
      entry.next.prev = entry.prev
      entry.next = undefined
      if (newest) {
        newest.next = entry
        entry.prev = newest
      }
    }
    newest = entry
  }

  return {
    get(key: string): T | undefined {
      const entry = cache.get(key)
      if (!entry) return undefined
      touch(entry)
      return entry.value
    },
    set(key: string, value: T): void {
      if (cache.size >= max && oldest) {
        const toDelete = oldest
        cache.delete(toDelete.key)
        if (toDelete.next) {
          oldest = toDelete.next
          toDelete.next.prev = undefined
        }
        if (toDelete === newest) {
          newest = undefined
        }
      }
      const existing = cache.get(key)
      if (existing) {
        existing.value = value
        touch(existing)
      } else {
        const entry: Node = { key, value, prev: newest }
        if (newest) newest.next = entry
        newest = entry
        if (!oldest) oldest = entry
        cache.set(key, entry)
      }
    },
  }
}
