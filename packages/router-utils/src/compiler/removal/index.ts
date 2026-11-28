/**
 * Removal, the one algorithm (SPEC G16, R153 amendment, R170): a definition
 * the source used from text an output no longer holds leaves that output
 * when nothing that stays reads it by value.
 *
 * Four parts, in this order and each in its own module:
 * - `closure.ts`: what the source used from removed text (the candidates);
 * - `build.ts`: the candidates' definitions below the units, in their slots;
 * - `mark.ts`: what stays, from placement's roots, in one view of the text;
 * - `render.ts`: how what does not stay gives up its text.
 * Placement calls it once, before it reads the tree: `provenance` on every
 * plan with removed text, `decide` only when a candidate is defined below
 * the units. The top-level units stay placement's: it removes, moves and
 * copies them by the same rule, with the same roots.
 */
import { NEED_KINDS } from '../clusters'
import { SELF_CHECKS, internalError } from '../self-checks'
import { Definitions, definedBelow } from './build'
import { closure, sourceUses } from './closure'
import { mark } from './mark'
import { NamedText } from './named'
import { render } from './render'
import type { Cluster, ClusterGraph, ClusterId } from '../clusters'
import type { PlacementInput, RootRef } from '../placement'
import type { ReadIndex } from '../reads'
import type { OutputId } from '../rewrite'
import type { Def } from './build'
import type { Named } from './named'
import type { Provenance } from './closure'

export { listEnd, removeListItems } from './lists'
export { sourceUses }

/** An output no planner addresses: its view holds the edits addressed to every output. */
const EVERY: OutputId = 'derived:\0every-output'

export interface RemovalRoots {
  /** Whether a cluster stays whatever reads it. */
  keeps: (cl: Cluster) => boolean
  /** The roots of every output. */
  every: () => ReadonlyArray<RootRef>
  /** The roots of the env module and of the outputs that may import from it (not of a copy). */
  env: () => ReadonlyArray<RootRef>
  clusterOfRoot: (r: RootRef) => ClusterId | undefined
  /** Whether an output copies the module (its roots are not the env module's: `env`). */
  copies: boolean
}

export class Removal {
  /** The clusters the source used from removed text. */
  readonly fromRemoved: ReadonlySet<ClusterId>
  /** R163: the clusters erased text names. */
  readonly erasedUse: ReadonlySet<ClusterId>
  /** The clusters that stay whatever reads them: beside what removed text used they hold code it did not (it was unused before, or it runs for its effect). */
  readonly keep = new Set<ClusterId>()
  /** The definitions below the units: built when one is needed (most modules have none). */
  private built: Definitions | null = null
  private readonly named: NamedText
  private readonly provenance: Provenance
  /** Per region holding them (-1: none). */
  private readonly pins = new Map<number, Array<Def>>()

  constructor(
    private readonly input: PlacementInput,
    private readonly graph: ClusterGraph,
    reads: ReadIndex,
    private readonly removable: (c: ClusterId) => boolean,
  ) {
    const { rewrites, t1 } = input
    this.named = new NamedText(rewrites)
    const envView = rewrites.view('env')
    this.provenance = closure({
      input,
      graph,
      reads,
      below: (s) => definedBelow(input, graph, removable, s),
      defs: () => this.defs,
      named: this.named,
      envView,
      // (planners address an output's own text through claims and
      // placeholders: without either, what the env module does not hold no
      // output holds, and the two views are one)
      every:
        rewrites.claims.size > 0 || rewrites.places.length > 0
          ? rewrites.view(EVERY)
          : envView,
    })
    const p = this.provenance
    this.fromRemoved = p.fromRemoved
    this.erasedUse = p.erasedUse
    // a declaration that reads itself while it is initialised throws: a statement
    for (const c of p.selfReading) {
      for (const u of graph.clusters[c]!.units) {
        const unit = t1.units[u]!
        if (
          unit.kind === 'declaration' &&
          (unit.node.type === 'VariableDeclarator' ||
            unit.node.type === 'ClassDeclaration') &&
          this.defs.readsItself(unit.node)
        ) {
          this.keep.add(c)
        }
      }
    }
    if (!this.pending) {
      return
    }
    const candidates = new Set(p.below)
    this.defs.index((s) => candidates.has(s))
    // code the source did not use from removed text, beside what it did:
    // it stays as written where the text holding it stays
    for (const d of this.defs.all) {
      if (
        d.cand !== 0 ||
        !d.code ||
        d.unit ||
        d.kind === 'key' ||
        (d.parent !== null && d.parent.cand === 0)
      ) {
        continue
      }
      let top = d
      while (top.parent !== null) {
        top = top.parent
      }
      const r = rewrites.regions.innermostAt(top.start, top.end) ?? -1
      let list = this.pins.get(r)
      if (!list) {
        this.pins.set(r, (list = []))
      }
      list.push(d)
      for (let x: Def | null = d; x !== null; x = x.parent) {
        if (x.unit && x.kind === 'declarator') {
          // (a top-level declarator placement would remove: it stays, emptied of what goes)
          this.keep.add(this.defs.clusterAt(x)!)
        }
      }
    }
  }

  private get defs(): Definitions {
    return (this.built ??= new Definitions(
      this.input,
      this.graph,
      this.removable,
    ))
  }

  /** Whether a candidate is defined below the units (else placement alone decides, as for any module). */
  get pending(): boolean {
    return this.provenance.below.length > 0
  }

  /**
   * Whether text that certainly stays reads every candidate, in the env
   * module's view: a reference that renders there, in no definition's text,
   * in a cluster that is a root (placement keeps it, or an output that may
   * import from the env module roots it). Every candidate then stays, in
   * every view, and nothing can leave: the mark would find the same. (The
   * common case: a component's local a `<Hydrate>` boundary's children
   * capture.)
   */
  private readByRoots(roots: RemovalRoots): boolean {
    const { input, graph, defs } = this
    const { rewrites, t1 } = input
    const envView = rewrites.view('env')
    let rooted: Set<ClusterId> | null = null
    const isRoot = (c: ClusterId): boolean => {
      if (rooted === null) {
        rooted = new Set()
        const claimed = new Map<number, Array<number>>()
        for (const claim of rewrites.claims.values()) {
          const at = rewrites.regions.get(claim.region).range.start
          let list = claimed.get(claim.owner)
          if (!list) {
            claimed.set(claim.owner, (list = []))
          }
          list.push(at)
        }
        for (const r of roots.env()) {
          const rc =
            r.t === 'sym'
              ? graph.clusterOfSym.get(r.id)
              : roots.clusterOfRoot(r)
          if (rc === undefined) {
            continue
          }
          // (a claim's owner is rooted where a claim of its stands: in no
          // definition's text)
          const ats = graph.clusters[rc]!.gens.flatMap(
            (g) => claimed.get(g) ?? [],
          )
          if (ats.length === 0 || ats.some((at) => defs.ownerAt(at) === null)) {
            rooted.add(rc)
          }
        }
      }
      return rooted.has(c) || roots.keeps(graph.clusters[c]!)
    }
    for (const s of this.provenance.below) {
      let read = false
      for (const ref of t1.refs.refsOf(s)) {
        if (
          NEED_KINDS.has(ref.kind) &&
          defs.ownerAt(ref.range.start) === null &&
          !envView.isErasedAt(ref.range.start)
        ) {
          const c = defs.clusterAt(ref.range)
          if (c !== undefined && isRoot(c)) {
            read = true
            break
          }
        }
      }
      if (!read) {
        return false
      }
    }
    return true
  }

  /**
   * Decides the definitions below the units and writes their removals.
   * Returns whether it changed the rewrite tree.
   */
  decide(roots: RemovalRoots): boolean {
    const { input, graph, defs, named } = this
    const { rewrites } = input
    if (this.readByRoots(roots)) {
      return false
    }
    const every = rewrites.view(EVERY)
    const envView = rewrites.view('env')
    const namedOf = new Map<number, Array<Named>>()
    /** Whether every generated name stands in the env module's text too. */
    let namedInEnv = true
    for (const n of named.all()) {
      namedInEnv &&= named.applies(n, 'env', envView)
      const r = rewrites.regions.innermostAt(n.at)
      if (r === null) {
        continue
      }
      let list = namedOf.get(r)
      if (!list) {
        namedOf.set(r, (list = []))
      }
      list.push(n)
    }
    const base = {
      input,
      graph,
      defs,
      named,
      namedOf,
      keeps: roots.keeps,
      clusterOfRoot: roots.clusterOfRoot,
      pins: this.pins,
    }
    const staysEvery = mark({
      ...base,
      view: every,
      output: null,
      roots: roots.every(),
    })
    // the env module alone: what only its own erasures orphan stays in the
    // outputs that still render the readers. Same roots, same text, same
    // claims and same generated names: the same mark
    let staysEnv = staysEvery
    const same = (
      x: ReadonlyArray<{ start: number; end: number }>,
      y: ReadonlyArray<{ start: number; end: number }>,
    ) =>
      x.length === y.length &&
      x.every((r, i) => r.start === y[i]!.start && r.end === y[i]!.end)
    // (a claim that applies in one view and not in the other changes whose
    // text its region is)
    let claimsAlike = true
    for (const node of rewrites.claimNodes.values()) {
      claimsAlike &&= envView.isClaimed(node) === every.isClaimed(node)
    }
    if (
      roots.copies ||
      !namedInEnv ||
      !claimsAlike ||
      !same(envView.erasedParts(), every.erasedParts())
    ) {
      staysEnv = mark({
        ...base,
        view: envView,
        output: 'env',
        roots: roots.env(),
      })
      if (SELF_CHECKS) {
        for (let i = 0; i < staysEnv.length; i++) {
          if (staysEnv[i] === 1 && staysEvery[i] === 0) {
            throw internalError(
              'removal: a definition stays in the env module and in no output',
            )
          }
        }
      }
    }
    let changed = render({
      input,
      defs,
      stays: staysEvery,
      earlier: null,
      view: every,
      scope: 'all-outputs',
    })
    if (staysEnv !== staysEvery) {
      changed =
        render({
          input,
          defs,
          stays: staysEnv,
          earlier: staysEvery,
          view: envView,
          scope: ['env'],
        }) || changed
    }
    return changed
  }
}
