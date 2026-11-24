/**
 * What assigns a module's bindings (`x = …`, `x++`, a destructuring or
 * for-in/of target, a `var` declared again with a value, a Solid `ref={x}`
 * that may assign: `ClassifiedRef.assigns`), for the planners that ask
 * whether a binding keeps the value its declaration gave it (the router
 * planner's options, the Hydrate captures) and for the glue's export check.
 * A view over the classified references: nothing is built until a binding is
 * asked about, and then once. Erasure is the consumer's business, passed as
 * the `live` filter; a possible assignment counts only through one (a ref in
 * text an output erases assigns nothing there). `reassignedServerCode`
 * asks it for the planners' server code passed by name.
 */
import { unwrapExpression } from './source'
import type { ClassifiedRef, RefIndex, Tier1 } from './analysis'
import type { Range } from './header'
import type { SymbolId } from './symbols'
import type { Node } from 'yuku'

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

/**
 * The binding server code passes by name (`arg`, through a cast:
 * `.handler(h as any)` passes `h` all the same) when the client keeps
 * assignments of it that only server code needs: the module writes it
 * explicitly (`h = …`, `h ??= …`, a destructuring target, in any function)
 * outside `serverCode`, the module's server-only text, and nothing the
 * client keeps for its own sake reads it: no read outside `serverCode` and
 * the top-level statements writing it (`h = wrap(h)`, `if (!h) h = …`), no
 * export. Such assignments are statements, which the client output keeps
 * with what they read (R154), so the server code they assign ships to the
 * client. A planner refuses every argument it names, in every compile
 * (SPEC J4.5): the verdict reads the source only. A binding the client reads
 * anyway (a validator a form uses too) ships with its assignments whatever
 * the planner does; assignments inside server code leave the client with
 * it. A Solid `ref={h}` is no explicit assignment (Solid sets it when the
 * element renders), and the element reads `h`. (A `const` alias or a
 * closure calling `h` is such a read: no rule follows the name further.)
 */
export function reassignedServerCode(
  t1: Tier1,
  arg: Node,
  serverCode: ReadonlyArray<Range>,
): SymbolId | null {
  const named = unwrapExpression(arg)
  if (named.type !== 'Identifier') {
    return null
  }
  const sym = t1.refs
    .refsIn(named)
    .find((r) => r.range.start === named.start)?.sym
  if (sym === undefined) {
    return null
  }
  const inServerCode = (r: ClassifiedRef) => within(r.range, serverCode)
  const kept = t1.mutation.writesOf(sym).filter((w) => !inServerCode(w))
  if (kept.length === 0) {
    return null
  }
  const writing = t1.items
    .map((item) => item.nodeRange)
    .filter((statement) => kept.some((w) => within(w.range, [statement])))
  const readByClient =
    t1.refs.refsOf(sym).some((r) => r.kind === 'exportSpecifier') ||
    (t1.declaringUnits.get(sym) ?? []).some(
      (u) => t1.units[u]!.exported.length > 0,
    ) ||
    t1.refs
      .valueRefsOf(sym)
      .some((r) => !inServerCode(r) && !within(r.range, writing))
  return readByClient ? null : sym
}

function within(range: Range, texts: ReadonlyArray<Range>): boolean {
  return texts.some((t) => t.start <= range.start && range.end <= t.end)
}
