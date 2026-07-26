// Slot mechanics shared by the binding's plain-`.ts` hooks (copied from
// Octane's TanStack bindings). The Octane compiler injects a per-call-site Symbol slot into
// every hook call in `.tsrx`/`.tsx`, but these binding files are NOT compiled — so
// a hook here receives the caller's slot as its trailing argument and derives a
// distinct sub-slot for each base hook it composes.

// Derive a stable, distinct sub-slot from a wrapper's slot, namespaced per hook so
// composing multiple base hooks gives each its own identity.
// Memoized: subSlot runs on EVERY hook call every render, and the naive form
// pays a string concat + global symbol-registry lookup each time. The cache is
// keyed by the slot symbol itself; the minted value is byte-identical to the
// uncached Symbol.for result, so identity is preserved across HMR re-evals and
// the per-package copies of this helper. Key universe is bounded: slots are
// per-call-site module constants (never minted per render).
const subSlotCache = new Map<symbol, Map<string, symbol>>()
export function subSlot(
  slot: symbol | undefined,
  tag: string,
): symbol | undefined {
  if (slot === undefined) {
    return undefined
  }
  let byTag = subSlotCache.get(slot)
  if (byTag === undefined) {
    subSlotCache.set(slot, (byTag = new Map()))
  }
  let sym = byTag.get(tag)
  if (sym === undefined) {
    byTag.set(tag, (sym = Symbol.for((slot.description ?? '') + ':' + tag)))
  }
  return sym
}

// Split the compiler-injected (or .ts-forwarded) trailing slot off a hook's args,
// returning the user args (everything before it) and the slot.
export function splitSlot(args: Array<any>): [Array<any>, symbol | undefined] {
  const tail = args[args.length - 1]
  const slot = typeof tail === 'symbol' ? tail : undefined
  return [slot !== undefined ? args.slice(0, -1) : args, slot]
}
