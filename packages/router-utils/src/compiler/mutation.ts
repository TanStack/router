/**
 * What writes a module's bindings: every assignment of a binding and every
 * write of a member of one through its own name (`writeKind`), for the
 * planners that ask whether a binding keeps the value its declaration gave
 * it (the router planner's options, the server-fn hoist, the Hydrate
 * captures) and for the glue's export check. A view over the classified
 * references: nothing is built until a binding is asked about, and then
 * once. Erasure is the consumer's business, passed as the `live` filter.
 */
import type { ClassifiedRef, RefIndex } from './analysis'
import type { SymbolId } from './symbols'

type WriteKind = 'assign' | 'member'

/**
 * Whether a reference writes: `assign`, the binding itself gets a value
 * (`x = …`, `x++`, a destructuring or for-in/of target, a `var` declared
 * again with a value); `member`, the
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

  /**
   * The binding is assigned somewhere (`live`: in code an output keeps):
   * its value is not the one its declaration gave it.
   */
  isReassigned(sym: SymbolId, live?: (ref: ClassifiedRef) => boolean): boolean {
    return this.sitesOf(sym).some(
      (r) => r.kind === 'write' && (live === undefined || live(r)),
    )
  }

  /**
   * The binding is assigned, or a member of what it names written through
   * this name, somewhere (`live`: in code an output keeps): a read of it
   * depends on when it runs. Writes through another name holding its
   * object are not followed.
   */
  isMutated(sym: SymbolId, live?: (ref: ClassifiedRef) => boolean): boolean {
    const sites = this.sitesOf(sym)
    return live === undefined ? sites.length > 0 : sites.some(live)
  }
}
