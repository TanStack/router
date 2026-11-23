/**
 * The items of a comma-separated list (declarators, pattern or object
 * properties) that leave it: one helper for the core's removals
 * (`render.ts`) and for the planners'.
 */
import { nextToken } from '../source'
import type { Node } from 'yuku'
import type { Range } from '../header'
import type { PlanContext } from '../plan'

/**
 * Removes the gone items of a comma-separated list, computed from the
 * list's final kept set: each run of gone items (pruned now, or erased
 * before) holding one pruned now is one range with the separator to its
 * next kept item (or from its previous one), so removals of neighbours
 * never partially overlap and a later run encloses the earlier one it grew
 * from. When every item is gone the range runs from the first item to
 * `closing` (the list's closing bracket, or `listEnd`), so a trailing comma
 * goes too; a list without a closing bracket never loses every item (its
 * caller keeps one).
 */
export function removeItems(
  items: ReadonlyArray<Node>,
  gone: (item: Node) => boolean,
  pruned: ReadonlySet<Node>,
  closing: number | null,
  remove: (range: Range) => void,
): void {
  const prunedNow = (from: number, to: number) =>
    items.slice(from, to + 1).some((item) => pruned.has(item))
  if (closing !== null && items.every(gone)) {
    if (prunedNow(0, items.length - 1)) {
      remove({ start: items[0]!.start, end: closing })
    }
    return
  }
  for (let i = 0; i < items.length; i++) {
    if (!gone(items[i]!)) {
      continue
    }
    let j = i
    while (j + 1 < items.length && gone(items[j + 1]!)) {
      j++
    }
    if (prunedNow(i, j)) {
      const next = items[j + 1]
      const prev = items[i - 1]
      remove(
        next
          ? { start: items[i]!.start, end: next.start }
          : { start: prev!.end, end: items[j]!.end },
      )
    }
    i = j
  }
}

/** `removeItems` for a planner: it passes the items it removes as both `gone` and `pruned`. */
export function removeListItems(
  ctx: PlanContext,
  items: ReadonlyArray<Node>,
  gone: (item: Node) => boolean,
  pruned: ReadonlySet<Node>,
  closing: number | null,
  by: string,
): void {
  removeItems(items, gone, pruned, closing, (range) =>
    ctx.rewrites.edit({ range, body: [], by }),
  )
}

/** Where a list ends: after its last item and the comma that may follow it (`closing` of `removeListItems`; `{ , }` is no syntax). */
export function listEnd(code: string, items: ReadonlyArray<Node>): number {
  const last = items[items.length - 1]!
  const next = nextToken(code, last.end)
  return code[next] === ',' ? next + 1 : last.end
}
