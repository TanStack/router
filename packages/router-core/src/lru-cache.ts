export type LRUCache<T> = {
  get: (key: string) => T | undefined
  set: (key: string, value: T) => void
}

export function createLRUCache<T>(max: number): LRUCache<T> {
  const cache = new Map<string, T>()
  type Node = { before?: Node; after?: Node; key: string }
  const doublyLinkedList = new Map<string, Node>()
  let oldest: Node | undefined
  let newest: Node | undefined

  const touch = (entry: Node) => {
    if (!entry.before) {
      if (entry.after) {
        entry.after.before = undefined
        oldest = entry.after
        entry.after = undefined
      }
      if (newest) {
        entry.before = newest
        newest.after = entry
      }
    } else {
      entry.before.after = entry.after
      if (entry.after) {
        entry.after.before = entry.before
        entry.after = undefined
      }
      if (newest) {
        newest.after = entry
        entry.before = newest
      }
    }
    newest = entry
  }

  return {
    get(key: string): T | undefined {
      if (!cache.has(key)) {
        return undefined
      }
      const value = cache.get(key)
      const entry = doublyLinkedList.get(key)
      if (entry?.after) {
        touch(entry)
      }
      return value
    },
    set(key: string, value: T): void {
      if (cache.size >= max && oldest) {
        const toDelete = oldest
        cache.delete(toDelete.key)
        doublyLinkedList.delete(toDelete.key)
        if (toDelete.after) {
          oldest = toDelete.after
          toDelete.after.before = undefined
        }
        if (toDelete === newest) {
          newest = undefined
        }
      }
      cache.set(key, value)
      const existing = doublyLinkedList.get(key)
      if (existing) {
        touch(existing)
      } else {
        const entry: Node = { key, before: newest }
        if (newest) newest.after = entry
        newest = entry
        if (!oldest) oldest = entry
        doublyLinkedList.set(key, entry)
      }
    },
  }
}
