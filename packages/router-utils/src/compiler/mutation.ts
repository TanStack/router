/**
 * The one model of what writes a module's bindings (README, "Reachability =
 * splitting = dead-code removal"): every assignment of a binding and every
 * write of a member of one, with where and when it happens. Every rule that
 * asks "does something write this?" reads it: the clustering of writers with
 * what they write, ordered evaluation, the movable test, the extraction
 * candidates, the split planner's identifier option values, the server-fn
 * hoist and the Hydrate setters. A view over the classified references
 * (nothing is built until a binding is asked about, and then once); erasure
 * (which writes survive in an output) and the region holding a write
 * (planners register sub-regions after the analysis) are the consumer's
 * business, so the model is pristine.
 */
import type { ClassifiedRef, RefIndex } from './analysis'
import type { SymbolId } from './symbols'

export type WriteKind = 'assign' | 'member'

/**
 * Whether a reference writes: `assign`, the binding itself gets a value
 * (`x = …`, `x++`, a destructuring or for-in/of target); `member`, the
 * object it names is mutated (`x.p = …`, `delete x.p`, `x.push(…)`,
 * `Object.assign(x, …)`); null, a read.
 */
export function writeKind(ref: ClassifiedRef): WriteKind | null {
  return ref.kind === 'write'
    ? 'assign'
    : ref.kind === 'value' && ref.memberWrite === true
      ? 'member'
      : null
}

export class MutationModel {
  private sites: Map<SymbolId, ReadonlyArray<ClassifiedRef>> | null = null

  constructor(private readonly refs: RefIndex) {}

  /** The write references of `sym` (`writeKind` of each), in source order. */
  sitesOf(sym: SymbolId): ReadonlyArray<ClassifiedRef> {
    this.sites ??= new Map()
    let hit = this.sites.get(sym)
    if (hit === undefined) {
      hit = this.refs.refsOf(sym).filter((r) => writeKind(r) !== null)
      this.sites.set(sym, hit)
    }
    return hit
  }

  /** The binding is assigned somewhere: its value is not the one its declaration gave it. */
  isReassigned(sym: SymbolId): boolean {
    return this.sitesOf(sym).some((r) => r.kind === 'write')
  }

  /** The binding is assigned, or a member of what it names written, somewhere: a read of it depends on when it runs. */
  isMutated(sym: SymbolId): boolean {
    return this.sitesOf(sym).length > 0
  }
}
