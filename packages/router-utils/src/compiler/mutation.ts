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
    const sites = this.sitesOf(sym)
    return sites.some((r) => counts(r, sites, live))
  }

  /** What assigns the binding (`live`: in code an output keeps), in source order. */
  writesOf(
    sym: SymbolId,
    live?: (ref: ClassifiedRef) => boolean,
  ): ReadonlyArray<ClassifiedRef> {
    const sites = this.sitesOf(sym)
    return sites.filter((r) => counts(r, sites, live))
  }

  private sitesOf(sym: SymbolId): ReadonlyArray<ClassifiedRef> {
    this.sites ??= new Map()
    let sites = this.sites.get(sym)
    if (sites === undefined) {
      sites = this.refs
        .refsOf(sym)
        .filter((r) => r.kind === 'write' || r.assigns !== undefined)
      this.sites.set(sym, sites)
    }
    return sites
  }
}

/**
 * Whether a write of `sites` counts: a possible assignment only through a
 * liveness filter, and on a callback binding only beside a kept explicit
 * write.
 */
function counts(
  r: ClassifiedRef,
  sites: ReadonlyArray<ClassifiedRef>,
  live: ((ref: ClassifiedRef) => boolean) | undefined,
): boolean {
  if (r.assigns === undefined) {
    return live === undefined || live(r)
  }
  return (
    live !== undefined &&
    live(r) &&
    (r.assigns === 'value' ||
      sites.some((w) => w.assigns === undefined && live(w)))
  )
}
