/**
 * The one model of what writes a module's bindings (README, "Reachability =
 * splitting = dead-code removal"): every assignment of a binding and every
 * write of a member of one, with where and when it happens. Every rule that
 * asks "does something write this?" reads it: the clustering of writers with
 * what they write, the event table's rules, the extraction
 * candidates, the router planner's identifier option values (its split
 * part), the server-fn hoist and the Hydrate setters. A view over the
 * classified references (nothing is built until a binding is asked about,
 * and then once). The model is pristine: erasure is the consumer's
 * business, passed as the `live` filter of the predicates (a write inside
 * erased code imposes nothing), and the region holding a write (planners
 * register sub-regions after the analysis) is read from the regions.
 *
 * It owns "the object a binding names", for reads and writes alike. A
 * name's value is its declaration and the statements writing it when the
 * module loads (`visitValues`), and it may hold other bindings' objects
 * (`const alias = cfg`, `const holder = { c: cfg }`, `holder.c = cfg`). A
 * read through a name (`alias.v`, `{ ...holder.c }`) reads what that value
 * holds; a member write through a name whose declaration does not create
 * its value (`ownsObject`: `alias.v = 1`, `let cur = cfg`) or through a
 * nested member (`holder.c.v = 1`) may write any object it holds
 * (`objectsWrittenBy`), so it is a write of each of those bindings too.
 */
import { ownsItsValue } from './units'
import type { ClassifiedRef, RefIndex, Tier1 } from './analysis'
import type { Range } from './header'
import type { SymbolId } from './symbols'
import type { UnitId } from './units'

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

/** What the value walk reads of the module. */
type ModuleShape = Pick<
  Tier1,
  'units' | 'declaringUnits' | 'runsLaterAt' | 'unitAt' | 'nodeAt' | 'parentOf'
>

/** The expressions and statements a write reference writes through (`writeTargets`' constructs). */
const WRITES = new Set([
  'AssignmentExpression',
  'UpdateExpression',
  'UnaryExpression',
  'CallExpression',
  'ForInStatement',
  'ForOfStatement',
  'VariableDeclarator',
])

const NO_UNITS: ReadonlyArray<UnitId> = []
const NO_SYMS: ReadonlyArray<SymbolId> = []
const NO_REFS: ReadonlyArray<ClassifiedRef> = []

export class MutationModel {
  private sites: Map<SymbolId, ReadonlyArray<ClassifiedRef>> | null = null
  private owns: Map<SymbolId, boolean> | null = null
  private constructs: Map<ClassifiedRef, Range> | null = null
  /** Per member write through another name, the other bindings whose objects it may write; per binding, those writes (built at the first ask, once). */
  private through: {
    objects: Map<ClassifiedRef, ReadonlyArray<SymbolId>>
    writes: Map<SymbolId, Array<ClassifiedRef>>
  } | null = null

  constructor(
    private readonly refs: RefIndex,
    /** The module (the tier the model belongs to, complete when first asked). */
    private readonly module: () => ModuleShape,
  ) {}

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
   * The binding is assigned, or a member of what it names written,
   * somewhere (`live`: in code an output keeps), through this name or
   * another one holding its object (`writesThrough`): a read of it depends
   * on when it runs.
   */
  isMutated(sym: SymbolId, live?: (ref: ClassifiedRef) => boolean): boolean {
    const sites = this.sitesOf(sym)
    if (live === undefined ? sites.length > 0 : sites.some(live)) {
      return true
    }
    const through = this.writesThrough(sym)
    return live === undefined ? through.length > 0 : through.some(live)
  }

  /**
   * Whether the object `sym` names is its own: its declarations create its
   * value (`ownsItsValue`: a function or class, a literal, a call's result)
   * and nothing reassigns it. A write of one of its members writes that
   * object only (R139).
   */
  ownsObject(sym: SymbolId): boolean {
    this.owns ??= new Map()
    let hit = this.owns.get(sym)
    if (hit === undefined) {
      const { units, declaringUnits } = this.module()
      hit =
        !this.isReassigned(sym) &&
        (declaringUnits.get(sym) ?? NO_UNITS).every((d) =>
          ownsItsValue(units[d]!),
        )
      this.owns.set(sym, hit)
    }
    return hit
  }

  /** The other bindings whose objects member write `ref` may write: what its name's value holds (none when it writes the object its name owns). */
  objectsWrittenBy(ref: ClassifiedRef): ReadonlyArray<SymbolId> {
    return this.throughWrites().objects.get(ref) ?? NO_SYMS
  }

  /** The member writes through another name that may write the object `sym` names (`objectsWrittenBy`). */
  writesThrough(sym: SymbolId): ReadonlyArray<ClassifiedRef> {
    return this.throughWrites().writes.get(sym) ?? NO_REFS
  }

  private throughWrites(): NonNullable<MutationModel['through']> {
    if (this.through !== null) {
      return this.through
    }
    const objects = new Map<ClassifiedRef, ReadonlyArray<SymbolId>>()
    const writes = new Map<SymbolId, Array<ClassifiedRef>>()
    this.through = { objects, writes }
    const { units, declaringUnits } = this.module()
    const textOf = (u: UnitId) => this.refs.refsIn(units[u]!.range)
    for (const ref of this.refs.all) {
      if (
        writeKind(ref) !== 'member' ||
        !declaringUnits.has(ref.sym) ||
        (!ref.readsThrough && this.ownsObject(ref.sym))
      ) {
        continue
      }
      // (a call's result is not its callee: `const [a, b] = make()`)
      const held: Array<SymbolId> = []
      this.visitValues([ref], true, textOf, (r) => {
        if (
          r.sym !== ref.sym &&
          r.kind === 'value' &&
          r.ctx !== 'callee' &&
          r.ctx !== 'newCallee' &&
          declaringUnits.has(r.sym) &&
          !held.includes(r.sym)
        ) {
          held.push(r.sym)
        }
        return false
      })
      if (held.length === 0) {
        continue
      }
      objects.set(ref, held)
      for (const s of held) {
        let list = writes.get(s)
        if (!list) {
          list = []
          writes.set(s, list)
        }
        list.push(ref)
      }
    }
    return this.through
  }

  /** The range of the expression or statement write reference `site` writes through (`x.p = v`, `x.push(v)`, `x = v`). */
  private constructOf(site: ClassifiedRef): Range {
    this.constructs ??= new Map()
    let hit = this.constructs.get(site)
    if (hit === undefined) {
      const { nodeAt, parentOf } = this.module()
      let n = nodeAt(site.range.start)
      while (n !== null && !WRITES.has(n.type)) {
        n = parentOf(n)
      }
      hit = n === null ? site.range : { start: n.start, end: n.end }
      this.constructs.set(site, hit)
    }
    return hit
  }

  /**
   * Walks the values the names of `roots` hold: for each, the text of its
   * declarations and of the writes of it when the module loads (`textOf`
   * of the unit holding each, within the write's expression: `holder.c =
   * cfg`), and, transitively, of the names those name (a member write's
   * root names what it writes, not a value). `eagerOnly`: only the
   * references that evaluate when the module loads (the value a name
   * holds; without it, the bodies a call reaching the name may run). Each
   * text is visited once, at the position of the first root (in source
   * order) reaching it; true from `visit` ends the walk (the result).
   */
  visitValues(
    roots: ReadonlyArray<ClassifiedRef>,
    eagerOnly: boolean,
    textOf: (u: UnitId) => ReadonlyArray<ClassifiedRef>,
    visit: (ref: ClassifiedRef, at: number) => boolean,
  ): boolean {
    const { units, declaringUnits, runsLaterAt, unitAt } = this.module()
    const ordered =
      roots.length < 2
        ? roots
        : [...roots].sort((a, b) => a.range.start - b.range.start)
    const seen = new Set<UnitId>()
    /** The writes whose expressions were entered (not inside a unit `seen` holds). */
    const seenWrites = new Set<ClassifiedRef>()
    /** The names whose declarations and writes were entered (once per walk). */
    const followed = new Set<SymbolId>()
    const work: Array<ClassifiedRef> = []
    /** Visits the text of unit `u` at `at`, within `within` (a write's expression) or whole (once per walk); true ends the walk. */
    const enter = (u: UnitId, at: number, within?: Range): boolean => {
      if (seen.has(u)) {
        return false
      }
      if (within === undefined) {
        seen.add(u)
      }
      for (const inner of textOf(u)) {
        if (
          within !== undefined &&
          (inner.range.start < within.start || inner.range.end > within.end)
        ) {
          continue
        }
        if (eagerOnly && (!inner.eager || runsLaterAt(inner.range.start))) {
          continue
        }
        if (visit(inner, at)) {
          return true
        }
        if (!inner.memberWrite) {
          work.push(inner)
        }
      }
      return false
    }
    for (const root of ordered) {
      const at = root.range.start
      work.push(root)
      while (work.length > 0) {
        const r = work.pop()!
        if (followed.has(r.sym)) {
          continue
        }
        followed.add(r.sym)
        for (const u of declaringUnits.get(r.sym) ?? NO_UNITS) {
          if (units[u]!.kind === 'declaration' && enter(u, at)) {
            return true
          }
        }
        for (const site of this.sitesOf(r.sym)) {
          if (
            !site.eager ||
            runsLaterAt(site.range.start) ||
            seenWrites.has(site)
          ) {
            continue
          }
          seenWrites.add(site)
          const u = unitAt(site.range)
          if (u !== null && enter(u, at, this.constructOf(site))) {
            return true
          }
        }
      }
    }
    return false
  }
}
