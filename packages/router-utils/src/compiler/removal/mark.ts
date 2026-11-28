/**
 * Mark: what stays, in one view of the text (the removal rule's second
 * half). Reachability by value from what stays whatever reads it, over the
 * clusters and the definitions below them together: no order between the
 * levels exists, and nothing starts at a candidate, so a cycle of candidates
 * keeps nothing alive.
 *
 * A reference counts where it renders and when the text that owns it stays:
 * the innermost definition holding it, else its cluster. The same holds for
 * every root below the units (code already unused, a claim's owner): it is a
 * root of the text that holds it, not of the module.
 */
import { NEED_KINDS, symRefsOf } from '../clusters'
import type { Cluster, ClusterGraph, ClusterId } from '../clusters'
import type { PlacementInput, RootRef } from '../placement'
import type { GenUnitId, OutputId, OutputView } from '../rewrite'
import type { SymbolId } from '../symbols'
import type { RegionId } from '../units'
import type { Def, Definitions } from './build'
import type { Named, NamedText } from './named'

export interface MarkInput {
  input: PlacementInput
  graph: ClusterGraph
  defs: Definitions
  named: NamedText
  /** The generated names standing in each region's text (the innermost region holding them). */
  namedOf: ReadonlyMap<RegionId, ReadonlyArray<Named>>
  /** What renders. */
  view: OutputView
  /** The output whose scopes decide which generated text stands (null: any output's does). */
  output: OutputId | null
  /** Whether a cluster stays whatever reads it (placement's keep predicate). */
  keeps: (cl: Cluster) => boolean
  /** The roots of the outputs this view answers for. */
  roots: ReadonlyArray<RootRef>
  clusterOfRoot: (r: RootRef) => ClusterId | undefined
  /** The definitions that stay when the text holding them does (code already unused), per region holding them (-1: none). */
  pins: ReadonlyMap<RegionId, ReadonlyArray<Def>>
}

/** Per definition (by id): whether it stays in the view. */
export function mark(a: MarkInput): Uint8Array {
  const { input, graph, defs, view } = a
  const { clusters, clusterOfSym, ownedRefs } = graph
  const { rewrites } = input
  const { regions } = rewrites
  const gens = rewrites.generated
  const stays = new Uint8Array(defs.all.length)
  // A region another output claims is, in a view where the claim does not
  // apply (a server function's chain claimed for a provider copy, `except:
  // ['env']`), text of what holds it: read with its holder's cluster, as
  // placement reads it (`reads.ts`).
  const holderOf = new Map<RegionId, RegionId>()
  for (const [claim, node] of rewrites.claimNodes) {
    const parent = regions.parentOf(claim.region)
    if (parent !== null && !view.isClaimed(node)) {
      holderOf.set(claim.region, parent)
    }
  }
  /** The cluster whose text a region is in this view. */
  const clusterIn = (r: RegionId): ClusterId | undefined => {
    let h = r
    for (let up = holderOf.get(h); up !== undefined; up = holderOf.get(h)) {
      h = up
    }
    return graph.clusterOfRegion.get(h)
  }
  const unclaimed = new Map<ClusterId, Array<RegionId>>()
  for (const r of holderOf.keys()) {
    const c = clusterIn(r)
    if (c !== undefined) {
      let list = unclaimed.get(c)
      if (!list) {
        unclaimed.set(c, (list = []))
      }
      list.push(r)
    }
  }
  // what a definition's text reads and roots, held until it stays
  const heldSyms: Array<Array<SymbolId> | undefined> = []
  const heldClusters: Array<Array<ClusterId> | undefined> = []
  const heldPins: Array<Array<Def> | undefined> = []
  const reached = new Uint8Array(clusters.length)
  const work: Array<ClusterId> = []

  const visit = (c: ClusterId | undefined) => {
    if (c !== undefined && reached[c] === 0) {
      reached[c] = 1
      work.push(c)
    }
  }
  const read = (s: SymbolId) => {
    const ds = defs.ofSym.get(s)
    if (ds !== undefined) {
      for (const d of ds) {
        stay(d)
      }
    }
    visit(clusterOfSym.get(s))
  }
  const stay = (d: Def) => {
    if (stays[d.id] === 1) {
      return
    }
    stays[d.id] = 1
    // (a computed key can stay for a rest element while its property goes)
    if (d.parent !== null && d.kind !== 'key') {
      stay(d.parent)
    }
    for (const c of d.children) {
      // not ours: it stays as written where its holder does (a computed key
      // with its property); a unit declarator stays where its cluster does
      if (c.cand === 0 && !c.unit) {
        stay(c)
      }
    }
    if (d.kind === 'rest' && d.parent?.pattern?.type === 'ObjectPattern') {
      // the rest element receives every key the pattern does not name: the
      // computed keys beside it stay, whatever their properties do
      for (const sibling of d.parent.children) {
        for (const k of sibling.children) {
          if (k.kind === 'key') {
            stay(k)
          }
        }
      }
    }
    const syms = heldSyms[d.id]
    if (syms !== undefined) {
      heldSyms[d.id] = undefined
      for (const s of syms) {
        read(s)
      }
    }
    const cs = heldClusters[d.id]
    if (cs !== undefined) {
      heldClusters[d.id] = undefined
      for (const c of cs) {
        visit(c)
      }
    }
    const pins = heldPins[d.id]
    if (pins !== undefined) {
      heldPins[d.id] = undefined
      for (const p of pins) {
        stay(p)
      }
    }
  }
  /** A reference at `at`: read when the text that owns it stays. */
  const own = (at: number, s: SymbolId) => {
    const d = defs.ownerAt(at)
    if (d === null || stays[d.id] === 1) {
      read(s)
    } else {
      ;(heldSyms[d.id] ??= []).push(s)
    }
  }
  /** Whether reading `s` could change anything yet. */
  const settled = (s: SymbolId): boolean => {
    if (defs.ofSym.has(s)) {
      return false
    }
    const c = clusterOfSym.get(s)
    return c === undefined || reached[c] === 1
  }
  /** A root at `at`: it stays when the text that holds it does. */
  const pin = (p: Def) => {
    let top = p
    while (top.parent !== null) {
      top = top.parent
    }
    const outer = top.outer
    if (outer === null || stays[outer.id] === 1) {
      stay(p)
    } else {
      ;(heldPins[outer.id] ??= []).push(p)
    }
  }

  // the claims each generated unit owns: it is rooted where one of them stands
  const claimsOf = new Map<GenUnitId, Array<number>>()
  for (const claim of rewrites.claims.values()) {
    const at = rewrites.regions.get(claim.region).range.start
    let list = claimsOf.get(claim.owner)
    if (!list) {
      claimsOf.set(claim.owner, (list = []))
    }
    list.push(at)
  }
  /** A cluster an output roots: a claim's owner is rooted by the text holding its claim. */
  const root = (c: ClusterId | undefined) => {
    if (c === undefined || reached[c] === 1) {
      return
    }
    const holders: Array<Def> = []
    for (const g of clusters[c]!.gens) {
      for (const at of claimsOf.get(g) ?? []) {
        const d = defs.ownerAt(at)
        if (d === null || stays[d.id] === 1) {
          visit(c)
          return
        }
        holders.push(d)
      }
    }
    if (holders.length === 0) {
      visit(c)
      return
    }
    for (const d of holders) {
      ;(heldClusters[d.id] ??= []).push(c)
    }
  }

  // (a root no region holds: none is known, it is a root of the module)
  for (const p of a.pins.get(-1) ?? []) {
    pin(p)
  }
  /** What a region's text reads where it renders, and the roots standing in it. */
  const readRegion = (r: RegionId) => {
    for (const p of a.pins.get(r) ?? []) {
      pin(p)
    }
    for (const ref of ownedRefs.get(r) ?? []) {
      if (
        NEED_KINDS.has(ref.kind) &&
        !settled(ref.sym) &&
        !view.isErasedAt(ref.range.start)
      ) {
        own(ref.range.start, ref.sym)
      }
    }
    for (const n of a.namedOf.get(r) ?? []) {
      if (
        (a.output === null || a.named.applies(n, a.output, view)) &&
        !view.isErasedAround({ start: n.at, end: n.end })
      ) {
        for (const s of n.syms) {
          own(n.at, s)
        }
      }
    }
  }
  for (const cl of clusters) {
    if (a.keeps(cl)) {
      root(cl.id)
    }
  }
  for (const r of a.roots) {
    if (r.t === 'sym') {
      read(r.id)
    } else {
      root(a.clusterOfRoot(r))
    }
  }
  while (work.length > 0) {
    const c = work.pop()!
    const cl = clusters[c]!
    for (const d of defs.unitsOf.get(c) ?? []) {
      stay(d)
    }
    for (const r of cl.regions) {
      readRegion(r)
    }
    for (const r of unclaimed.get(c) ?? []) {
      readRegion(r)
    }
    for (const g of cl.gens) {
      for (const s of symRefsOf(gens[g]!.body)) {
        read(s)
      }
    }
  }
  return stays
}
