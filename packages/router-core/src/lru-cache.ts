export type LRUCache<TKey, TValue> = {
  get: (key: TKey) => TValue | undefined
  set: (key: TKey, value: TValue) => void
  clear: () => void
}

export function createLRUCache<TKey, TValue>(
  max: number,
): LRUCache<TKey, TValue> {
  type Node = { prev?: Node; next?: Node; key: TKey; value: TValue }
  const cache = new Map<TKey, Node>()
  let oldest: Node | undefined
  let newest: Node | undefined

  const touch = (entry: Node) => {
    const next = entry.next
    if (!next) {
      return
    }
    const prev = entry.prev
    if (prev) {
      prev.next = next
    } else {
      oldest = next
    }
    next.prev = prev
    entry.prev = newest
    entry.next = undefined
    newest!.next = entry
    newest = entry
  }

  return {
    get(key) {
      const entry = cache.get(key)
      if (!entry) {
        return undefined
      }
      touch(entry)
      return entry.value
    },
    set(key, value) {
      const entry = cache.get(key)
      if (entry) {
        entry.value = value
        touch(entry)
        return
      }
      if (cache.size >= max && oldest) {
        cache.delete(oldest.key)
        oldest = oldest.next
        if (oldest) {
          oldest.prev = undefined
        } else {
          newest = undefined
        }
      }
      const newEntry: Node = { key, value, prev: newest }
      if (newest) {
        newest.next = newEntry
      } else {
        oldest = newEntry
      }
      newest = newEntry
      cache.set(key, newEntry)
    },
    clear() {
      cache.clear()
      oldest = undefined
      newest = undefined
    },
  }
}
