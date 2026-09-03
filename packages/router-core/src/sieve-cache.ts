export type SieveCache<TKey, TValue> = {
  get: (key: TKey) => TValue | undefined
  set: (key: TKey, value: TValue) => void
  clear: () => void
}

/**
 * A fixed-capacity cache using the SIEVE eviction algorithm
 * (https://cachemon.github.io/SIEVE-website/).
 *
 * Entries live in a FIFO list (`oldest` -> `newest`); a hit only flips a
 * `visited` bit instead of relinking the entry, which makes `get` (by far the
 * hottest operation here) a plain `Map.get`. Eviction sweeps a `hand` from the
 * oldest entry towards the newest, clearing `visited` bits until it finds an
 * unvisited entry to drop, so entries touched since the last sweep survive one
 * more round. This keeps LRU-like hit ratios while being scan-resistant.
 */
export function createSieveCache<TKey, TValue>(
  max: number,
): SieveCache<TKey, TValue> {
  type Node = {
    /** the next older entry */
    prev?: Node
    /** the next newer entry */
    next?: Node
    key: TKey
    value: TValue
    visited: boolean
  }
  const cache = new Map<TKey, Node>()
  let oldest: Node | undefined
  let newest: Node | undefined
  /** where the next eviction sweep resumes, `undefined` means "at `oldest`" */
  let hand: Node | undefined

  return {
    get(key) {
      const entry = cache.get(key)
      if (!entry) return undefined
      entry.visited = true
      return entry.value
    },
    set(key, value) {
      const existing = cache.get(key)
      if (existing) {
        existing.value = value
        return
      }
      if (cache.size >= max) {
        // sweep from `hand` towards `newest` (wrapping around to `oldest`),
        // clearing `visited` bits, and evict the first unvisited entry
        let node = hand ?? oldest!
        while (node.visited) {
          node.visited = false
          node = node.next ?? oldest!
        }
        hand = node.next
        if (node.prev) node.prev.next = node.next
        else oldest = node.next
        if (node.next) node.next.prev = node.prev
        else newest = node.prev
        cache.delete(node.key)
      }
      const entry: Node = { key, value, prev: newest, visited: false }
      if (newest) newest.next = entry
      else oldest = entry
      newest = entry
      cache.set(key, entry)
    },
    clear() {
      cache.clear()
      oldest = undefined
      newest = undefined
      hand = undefined
    },
  }
}
