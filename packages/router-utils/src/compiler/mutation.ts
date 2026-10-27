/**
 * The one model of what writes a module's bindings (README, "Reachability =
 * splitting = dead-code removal"): every assignment of a binding and every
 * write of a member of one, with where and when it happens. Every rule that
 * asks "does something write this?" reads it: the clustering of writers with
 * what they write, ordered evaluation, the movable test, the extraction
 * candidates, the split planner's identifier option values, the server-fn
 * hoist and the Hydrate setters. Built once per module from the classified
 * references; erasure (which writes survive in an output) and the region
 * holding a write (planners register sub-regions after the analysis) are
 * the consumer's business, so the model is pristine.
 */
import type { ClassifiedRef } from './analysis'
import type { Range } from './header'
import type { SymbolId } from './symbols'

export interface WriteSite {
  sym: SymbolId
  /** The written reference (`x` of `x = …`, `x.p = …`, `x.push(…)`). */
  range: Range
  /** Evaluated when the module loads: at the top level, or in a function called there (an IIFE). */
  eager: boolean
  /**
   * `assign`: the binding itself gets a value (`x = …`, `x++`, a
   * destructuring or for-in/of target); `member`: the object it names is
   * mutated (`x.p = …`, `delete x.p`, `x.push(…)`, `Object.assign(x, …)`).
   */
  kind: 'assign' | 'member'
}

export class MutationModel {
  /** Every write site, in source order. */
  readonly all: ReadonlyArray<WriteSite>
  private readonly bySym = new Map<SymbolId, Array<WriteSite>>()

  constructor(refs: ReadonlyArray<ClassifiedRef>) {
    const all: Array<WriteSite> = []
    for (const ref of refs) {
      const kind: WriteSite['kind'] | null =
        ref.kind === 'write'
          ? 'assign'
          : ref.kind === 'value' && ref.memberWrite
            ? 'member'
            : null
      if (kind === null) {
        continue
      }
      const site: WriteSite = {
        sym: ref.sym,
        range: ref.range,
        eager: ref.eager,
        kind,
      }
      all.push(site)
      let list = this.bySym.get(ref.sym)
      if (!list) {
        list = []
        this.bySym.set(ref.sym, list)
      }
      list.push(site)
    }
    this.all = all
  }

  sitesOf(sym: SymbolId): ReadonlyArray<WriteSite> {
    return this.bySym.get(sym) ?? NONE
  }

  /** The binding is assigned somewhere: its value is not the one its declaration gave it. */
  isReassigned(sym: SymbolId): boolean {
    return this.sitesOf(sym).some((w) => w.kind === 'assign')
  }

  /** The binding is assigned, or a member of what it names written, somewhere: a read of it depends on when it runs. */
  isMutated(sym: SymbolId): boolean {
    return this.bySym.has(sym)
  }

  /** Whether a write of `sym` that `counts` exists (a consumer's liveness and ownership). */
  mutatedBy(sym: SymbolId, counts: (w: WriteSite) => boolean): boolean {
    return this.sitesOf(sym).some(counts)
  }
}

const NONE: ReadonlyArray<WriteSite> = []
