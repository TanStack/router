/**
 * What assigns a module's bindings (`x = …`, `x++`, a destructuring or
 * for-in/of target, a `var` declared again with a value, a Solid `ref={x}`
 * that may assign: `ClassifiedRef.assigns`), for the planners that ask
 * whether a binding keeps the value its declaration gave it (the router
 * planner's options, the Hydrate captures) and for the glue's export check.
 * A view over the classified references: nothing is built until a binding is
 * asked about, and then once. Erasure is the consumer's business, passed as
 * the `live` filter; a possible assignment counts only through one (a ref in
 * text an output erases assigns nothing there).
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
      sites = this.refs
        .refsOf(sym)
        .filter((r) => r.kind === 'write' || r.assigns)
      this.sites.set(sym, sites)
    }
    return sites.filter((r) => (live === undefined ? !r.assigns : live(r)))
  }
}
