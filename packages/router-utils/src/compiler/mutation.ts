/**
 * What assigns a module's bindings (`x = …`, `x++`, a destructuring or
 * for-in/of target, a `var` declared again with a value), for the planners
 * that ask whether a binding keeps the value its declaration gave it (the
 * router planner's options, the Hydrate captures) and for the glue's export
 * check. A view over the classified references: nothing is built until a
 * binding is asked about, and then once. Erasure is the consumer's business,
 * passed as the `live` filter.
 */
import type { ClassifiedRef, RefIndex } from './analysis'
import type { SymbolId } from './symbols'

export class MutationModel {
  private sites: Map<SymbolId, ReadonlyArray<ClassifiedRef>> | null = null

  constructor(private readonly refs: RefIndex) {}

  /**
   * The binding is assigned somewhere (`live`: in code an output keeps):
   * its value is not the one its declaration gave it.
   */
  isReassigned(sym: SymbolId, live?: (ref: ClassifiedRef) => boolean): boolean {
    return this.writesOf(sym, live).length > 0
  }

  /** What assigns the binding (`live`: in code an output keeps), in source order. */
  writesOf(
    sym: SymbolId,
    live?: (ref: ClassifiedRef) => boolean,
  ): ReadonlyArray<ClassifiedRef> {
    this.sites ??= new Map()
    let sites = this.sites.get(sym)
    if (sites === undefined) {
      sites = this.refs.refsOf(sym).filter((r) => r.kind === 'write')
      this.sites.set(sym, sites)
    }
    return live === undefined ? sites : sites.filter(live)
  }
}
