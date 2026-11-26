/**
 * Closure: what the source used from removed text (provenance, the removal
 * rule's first half: R153 amendment, R154, R163).
 *
 * One worklist over bindings at every level. Seeds are the references inside
 * text the env module no longer holds; from each binding reached, every
 * reference in the text of its definitions is followed, whatever scope
 * declares the binding it names. Only what is reached can ever leave: code
 * the source never used from removed text stays as written.
 *
 * A binding is reached with a cause, carried along the closure:
 * - `USED`: from text the env module no longer holds (erased, or moved to
 *   another output): a candidate;
 * - `ERASED`: from text no output holds. Only along this cause is a type
 *   alias or an interface a name: text that names it has used what it names;
 * - `NAMED`: text the env module erases names it, by value or in a type, or
 *   text another planner's output claims reads it by value (R163: what
 *   erasure, not splitting, may take from a route module);
 * - `REMOVED`: removed text leads to it (not only a type that stays): a
 *   `declare` of it, text that stays as written, names imports for it.
 */
import { BindingFlags } from 'yuku'
import { NEED_KINDS } from '../clusters'
import { Declarations } from '../declarations'
import { rangeCover } from '../header'
import { hasRuntimeValue } from '../symbols'
import type { Binding, Node, Reference, SourceFile } from 'yuku'
import type { Declaration, Named } from '../declarations'
import type { ClusterGraph, ClusterId } from '../clusters'
import type { Range } from '../header'
import type { PlacementInput } from '../placement'
import type { ReadIndex } from '../reads'
import type { OutputView } from '../rewrite'
import type { SymbolId, SymbolTable } from '../symbols'
import type { Definitions } from './build'
import type { NamedText } from './named'

export const USED = 1
export const ERASED = 2
export const NAMED = 4
const REMOVED = 8
const CAUSES = USED | ERASED | NAMED | REMOVED
/** In `follow`'s record: the declaration was read for its imports too. */
const WITH_IMPORTS = 16

/** A removed text and what it gives the bindings it names (by value; in a type; whether a type declaration it names is followed). */
interface Part extends Range {
  value: number
  type: number
  relay: boolean
}

export interface Provenance {
  /** The clusters the source used from removed text. */
  fromRemoved: Set<ClusterId>
  /** R163: the clusters erased text names. */
  erasedUse: Set<ClusterId>
  /** The candidates defined below the units. */
  below: Array<SymbolId>
  /** The clusters a declaration of which reads itself in its own text (`Definitions.readsItself` decides). */
  selfReading: Set<ClusterId>
}

/** A reference erased with the types, and the declarations it names (`Declarations.resolve`). */
interface TypeRef {
  at: number
  sym: SymbolId
  named: Named
}

const byOffset = (x: TypeRef, y: TypeRef) => x.at - y.at

/** Above every offset (`TypeRefs`' keys of a range). */
const SPAN = 0x4000000

/**
 * The local scopes once each, by start (an outer one first), with each
 * one's nearest scope around it (-1: the module's). Scopes nest, so the
 * scopes around a text are the last one starting at or before it and the
 * scopes around that one.
 */
interface ScopeTree {
  start: Int32Array
  end: Int32Array
  parent: Int32Array
  count: number
}

/**
 * The references erased with the types (`typeof x`, `useState<X>()`), by
 * position. Module-level bindings are indexed once; a local binding is
 * visible only inside its scope, so a text is asked about the bindings of
 * the scopes around it and no other.
 */
class TypeRefs {
  private module: Array<TypeRef> | null = null
  /** Per local scope, by its range: the type-position references of its bindings. */
  private readonly byScope = new Map<number, Array<TypeRef>>()
  private locals: Map<number, Array<SymbolId>> | null = null
  /** The local scopes once each, built the first time a text inside one is read. */
  private tree: ScopeTree | null = null

  constructor(
    private readonly file: SourceFile,
    private readonly symbols: SymbolTable,
    private readonly table: Declarations,
  ) {}

  private collect(
    b: Binding,
    into: Array<TypeRef>,
    /** Only the references outside this range. */
    outside?: Range,
  ): void {
    if (b.has(BindingFlags.TypeParameter)) {
      return
    }
    // (the value references hold none of an ambient binding, `analysis.ts`:
    // every one of them is read here)
    const unindexed = this.symbols.kind(b.id as SymbolId) === 'ambient'
    const refs: ReadonlyArray<Reference> = b.references
    for (const ref of refs) {
      // (a reference in the type space is in a type position: Yuku's
      // `inTypePosition` says it is erased with the types)
      if (!ref.inTypePosition && !unindexed) {
        continue
      }
      const at = ref.node.start
      if (outside !== undefined && at >= outside.start && at < outside.end) {
        continue
      }
      into.push({
        at,
        sym: b.id as SymbolId,
        named: this.table.resolve(b, ref),
      })
    }
  }

  private moduleRefs(): Array<TypeRef> {
    if (this.module === null) {
      const list: Array<TypeRef> = []
      for (const b of this.file.rootScope.bindings) {
        this.collect(b, list)
      }
      // a namespace's member is visible in the namespace's other blocks (a
      // reopened namespace), where no scope around the text declares it:
      // those references are looked up with the module's
      if (this.symbols.namespaceBlocks) {
        for (const b of this.file.bindings) {
          const block = b.scope.node
          if (block.type === 'TSModuleBlock') {
            this.collect(b, list, block)
          }
        }
      }
      this.module = list.sort(byOffset)
    }
    return this.module
  }

  /** The type-position references of the bindings a local scope declares. */
  private scopeRefs(start: number, end: number): Array<TypeRef> {
    const key = start * SPAN + end
    let list = this.byScope.get(key)
    if (list === undefined) {
      list = []
      const bindings = this.file.bindings
      for (const s of this.localsOf(key)) {
        this.collect(bindings[s]!, list)
      }
      this.byScope.set(key, list.sort(byOffset))
    }
    return list
  }

  /** The bindings each local scope declares, by its range (one pass, the first time a text stands inside a scope). */
  private localsOf(key: number): ReadonlyArray<SymbolId> {
    if (this.locals === null) {
      this.locals = new Map()
      const count = this.file.bindings.length
      for (let s = 0; s < count; s++) {
        const r = this.symbols.scopeRange(s as SymbolId)
        if (r === null) {
          continue
        }
        const k = r.start * SPAN + r.end
        let list = this.locals.get(k)
        if (!list) {
          this.locals.set(k, (list = []))
        }
        list.push(s as SymbolId)
      }
    }
    return this.locals.get(key) ?? []
  }

  private scan(
    list: ReadonlyArray<TypeRef>,
    range: Range,
    visit: (ref: TypeRef) => void,
  ): void {
    let lo = 0
    let hi = list.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (list[mid]!.at < range.start) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    for (let i = lo; i < list.length && list[i]!.at < range.end; i++) {
      visit(list[i]!)
    }
  }

  /** Whether a type position names a module-level binding anywhere (else a top-level text has none to look up). */
  get any(): boolean {
    return this.moduleRefs().length > 0
  }

  /**
   * The type-position references inside `range`. `top`: a top-level
   * declaration's text, around which no scope but the module's stands.
   */
  in(range: Range, visit: (ref: TypeRef) => void, top = false): void {
    this.scan(this.moduleRefs(), range, visit)
    if (top) {
      return
    }
    // the bindings of the scopes around the text (those of the scopes inside
    // it leave with it): the last scope starting at or before the text, and
    // the scopes around that one (scopes nest: every scope around the text
    // is one of them)
    const { start, end, parent, count } = this.scopeTree()
    let lo = 0
    let hi = count
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (start[mid]! <= range.start) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    for (let i = lo - 1; i >= 0; i = parent[i]!) {
      // (a scope on exactly the text's range is the text's own: inside it)
      if (
        end[i]! >= range.end &&
        (start[i] !== range.start || end[i] !== range.end)
      ) {
        this.scan(this.scopeRefs(start[i]!, end[i]!), range, visit)
      }
    }
  }

  private scopeTree(): ScopeTree {
    if (this.tree === null) {
      // one number per scope, by start and an outer one first (the end
      // reversed; offsets stay below 2^26), sorted as numbers
      const local = this.symbols.localScopes
      const keys = new Float64Array(local.length)
      for (let i = 0; i < local.length; i++) {
        keys[i] = local[i]!.start * SPAN + (SPAN - 1 - local[i]!.end)
      }
      keys.sort()
      const start = new Int32Array(keys.length)
      const end = new Int32Array(keys.length)
      const parent = new Int32Array(keys.length)
      let n = 0
      let top = -1
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!
        // (a scope listed twice is read once)
        if (i > 0 && key === keys[i - 1]) {
          continue
        }
        const s = Math.floor(key / SPAN)
        const e = SPAN - 1 - (key - s * SPAN)
        // (the open scopes are a chain: the nearest one ending at or after
        // this one's end holds it)
        while (top >= 0 && end[top]! < e) {
          top = parent[top]!
        }
        start[n] = s
        end[n] = e
        parent[n] = top
        top = n++
      }
      this.tree = { start, end, parent, count: n }
    }
    return this.tree
  }
}

export interface ClosureInput {
  input: PlacementInput
  graph: ClusterGraph
  /** What each cluster's text names in the source (`ReadIndex.clusterReads`, not live). */
  reads: ReadIndex
  /** Whether a binding is defined below the units (`definedBelow`). */
  below: (s: SymbolId) => boolean
  /** The definitions below the units, built when the first such binding is reached. */
  defs: () => Definitions
  named: NamedText
  envView: OutputView
  /** The view of the edits addressed to every output (the env module's, when no edit is addressed to some outputs only). */
  every: OutputView
}

export function closure(a: ClosureInput): Provenance {
  const { input, graph, named, envView, every } = a
  const { t1, rewrites, outputs } = input
  const { symbols, refs, units } = t1
  const { clusters, clusterOfSym } = graph
  const file = input.file
  const gens = rewrites.generated
  const route = input.routeModule !== null

  // ---- removed text ---------------------------------------------------------
  const parts: Array<Part> = []
  for (const p of envView.erasedParts()) {
    const everywhere = every === envView || every.isErasedAt(p.start)
    const cause = USED | NAMED | REMOVED | (everywhere ? ERASED : 0)
    parts.push({ ...p, value: cause, type: cause, relay: everywhere })
  }
  for (const claim of rewrites.claims.values()) {
    // (R163: text another planner's output claims reads by value what it
    // takes; a split chunk's is splitting)
    const h = gens[claim.owner]!.home
    const erasure =
      route &&
      typeof h === 'string' &&
      h !== 'auto' &&
      h !== 'env' &&
      outputs.get(h)?.kind !== 'split'
    // (moved text names a type for itself: a type declaration is not
    // followed from it, D1)
    parts.push({
      ...rewrites.regions.get(claim.region).range,
      value: USED | REMOVED | (erasure ? NAMED : 0),
      type: USED | REMOVED,
      relay: false,
    })
  }

  // per symbol: the causes it is reached with (`CAUSES`), and four bits
  // higher those its text was read with
  const bits = new Uint8Array(symbols.size)
  const out: Provenance = {
    fromRemoved: new Set(),
    erasedUse: new Set(),
    below: [],
    selfReading: new Set(),
  }
  // type export syntax (`export type { X }`, `export { X }` of a type,
  // `Unit.stripped`) and an exported erased declaration (`export interface
  // X`, the alias `export { X }` exports, `export default X` of a `declare`,
  // a type an exported namespace exports) render in no output's JavaScript
  // (main's `stripTypeExports`): their text is removed text like an erased
  // handler's, and a value or an import only it reads was used by the
  // source (F1)
  const erased = (r: Range) =>
    parts.push({
      start: r.start,
      end: r.end,
      value: USED | ERASED | REMOVED,
      type: USED | ERASED | REMOVED,
      relay: true,
    })
  // (an exported erased declaration is a type unit of the module's own, not
  // an import's, or a namespace's member)
  let ownTypes = symbols.namespaceBlocks
  for (const u of units) {
    if (u.kind === 'type' && u.importIndex === null) {
      ownTypes = true
      if (u.stripped) {
        erased(u.range)
      }
    }
  }
  const table = new Declarations(file)
  if (ownTypes) {
    for (const b of table.exportedErased(symbols.namespaceBlocks)) {
      for (const d of table.of(b)) {
        if (d.kind === 'erased') {
          erased(d.node)
        }
      }
    }
  }

  // (a type in code that stays frees only a value of the module:
  // `typesNameValues`)
  if (parts.length === 0 && !t1.typesNameValues) {
    return out
  }

  // ---- the worklist ----------------------------------------------------------
  const types = new TypeRefs(file, symbols, table)
  const work: Array<SymbolId> = []
  /** The module-level bindings reached, once each. */
  const reached: Array<SymbolId> = []
  /** The `import A = N` aliases a type reference named: candidates whose statement was not read. */
  const aliases = new Set<SymbolId>()
  const reach = (s: SymbolId, b: number) => {
    const all = bits[s]!
    const have = all & CAUSES
    if ((have | b) !== have) {
      if (have === 0 && symbols.isModuleLevel(s)) {
        reached.push(s)
      }
      bits[s] = all | b
      work.push(s)
    }
  }
  /**
   * Whether a binding is declared inside `range`. Such a binding is not
   * reached from that text: it leaves with it or stays with it, and code
   * inside a definition that was unused before stays as written with the
   * definition (a local that only its own initialiser reads).
   */
  const inside = (s: SymbolId, range: Range): boolean => {
    const scope = symbols.scopeRange(s)
    return (
      scope !== null && scope.start >= range.start && scope.end <= range.end
    )
  }
  /**
   * Per type declaration followed for a name that is a value too, or as a
   * namespace's member, by offset: the causes it was read with, and
   * `WITH_IMPORTS` once it was read for its imports too.
   */
  let followed: Map<number, number> | null = null
  /**
   * Reads a type declaration: what it names was used. `imports`: the imports
   * it names too (not for a type that stays: whether such an import stays
   * is the host's, however many aliases lead to it).
   */
  const follow = (decl: Node, b: number, imports: boolean) => {
    const key = imports ? b | WITH_IMPORTS : b
    const before = (followed ??= new Map()).get(decl.start) ?? 0
    if ((before | key) !== before) {
      followed.set(decl.start, before | key)
      types.in(decl, (inner) => typed(inner, b | USED, true, imports))
    }
  }
  /**
   * Follows what `rest` names inside a namespace declaration: the alias or
   * interface it ends at, or the namespace it ends at, whole. False: the
   * names are not found there.
   */
  const within = (
    d: Declaration,
    rest: ReadonlyArray<string>,
    b: number,
    imports: boolean,
  ): boolean => {
    const ns = d.node
    if (ns.type !== 'TSModuleDeclaration') {
      return false
    }
    // (a dotted declaration, `namespace A.B {}`, names more than one: those
    // after the name it was reached by)
    let i = 0
    const dotted: Array<Node> = []
    for (let id: Node = ns.id; id.type === 'TSQualifiedName'; id = id.left) {
      dotted.unshift(id.right)
    }
    for (const name of dotted.slice(dotted.indexOf(d.id) + 1)) {
      if (i < rest.length && rest[i] !== (name as { name: string }).name) {
        return false
      }
      i++
    }
    if (i >= rest.length) {
      follow(ns, b, imports)
      return true
    }
    if (ns.body?.type !== 'TSModuleBlock') {
      return false
    }
    // the member of that name the namespace exports (explicitly, or
    // implicitly in an ambient one), with every declaration it has, across
    // reopened namespaces
    const member = file.scopeOf(ns.body).find(rest[i]!)
    if (member === null || !member.has(BindingFlags.Exported)) {
      return false
    }
    // (what the member is there, a type or a namespace, is the table's)
    return name(table.member(member, rest.slice(i + 1)), b, imports)
  }
  /** Follows the type declarations named; false: there are none. */
  const name = (
    { types, path }: Named,
    b: number,
    imports: boolean,
  ): boolean => {
    if (types === null) {
      return false
    }
    // `N.A.T` of a namespace that holds only types: the declaration named,
    // not what the others name. Where the names are not found, all of the
    // namespace: what it names leaves rather than stays
    if (path !== null) {
      let found = false
      for (const d of types) {
        found = within(d, path, b, imports) || found
      }
      if (found) {
        return true
      }
    }
    // the type declarations named: what they name was used; a value beside
    // them was not
    for (const d of types) {
      follow(d.node, b, imports)
    }
    return true
  }
  /** What a type-position reference gives what it names, from text with `b` (`imports`: `follow`'s). */
  const typed = (ref: TypeRef, b: number, relay: boolean, imports = true) => {
    if (!imports && symbols.isImport(ref.sym)) {
      return
    }
    if (ref.named.value) {
      reach(ref.sym, b)
    } else if (ref.named.aliases !== null) {
      // `import A = N` named for a type: each alias of the chain was used,
      // what their statements name was not
      for (const alias of ref.named.aliases) {
        aliases.add(symbols.ofBinding(alias))
      }
    }
    if (relay) {
      name(ref.named, b, imports)
    }
  }
  /** Reads a text with `value` (what a read by value gives) and `type` (what a type position gives). */
  const readText = (
    range: Range,
    value: number,
    type: number,
    relay: boolean,
    /** Text another output claims inside it is a seed of its own. */
    claimed: boolean,
    /** `follow`'s: what it names among the imports too. */
    imports = true,
  ) => {
    const { regions } = rewrites
    const own = (at: number) => {
      if (!claimed) {
        return true
      }
      for (let n = regions.nodeAt(at); n !== null; n = n.parent) {
        if (n.start < range.start || n.end > range.end) {
          break
        }
        if (n.claim !== null && envView.isClaimed(n)) {
          return false
        }
      }
      return true
    }
    for (const ref of refs.refsIn(range)) {
      if (
        NEED_KINDS.has(ref.kind) &&
        !inside(ref.sym, range) &&
        (imports || !symbols.isImport(ref.sym)) &&
        own(ref.range.start)
      ) {
        reach(ref.sym, value)
      }
    }
    types.in(range, (ref) => {
      if (!inside(ref.sym, range) && own(ref.at)) {
        typed(ref, type, relay, imports)
      }
    })
    named.in(range, (n) => {
      if (named.applies(n, 'env', envView)) {
        for (const s of n.syms) {
          reach(s, value)
        }
      }
    })
  }

  for (const p of parts) {
    for (const ref of refs.refsIn(p)) {
      if (NEED_KINDS.has(ref.kind) && !inside(ref.sym, p)) {
        reach(ref.sym, p.value)
      }
    }
    types.in(p, (ref) => {
      if (!inside(ref.sym, p)) {
        typed(ref, p.type, p.relay)
      }
    })
  }

  // a type never keeps a value: a type in code that stays is erased text
  // where it stands (TypeScript's `inTypePosition`, the parser's), and what
  // it names was used by the source. Not a named erased declaration's text
  // (an alias, an interface, a `declare`): that is read when the declaration
  // is named or exported (D1, T5–T8). Not an import, directly or through
  // aliases: whether it stays is the host's (`verbatimModuleSyntax`)
  if (t1.typesNameValues) {
    const removed = rangeCover(parts)
    for (const ref of file.references) {
      if (!ref.inTypePosition) {
        continue
      }
      const b = ref.binding
      if (
        b === null ||
        b.has(BindingFlags.Import | BindingFlags.TypeParameter)
      ) {
        continue
      }
      const at = ref.node.start
      // (removed text is read above, moved text names a type for itself)
      if (removed(at) || table.inNamedDeclaration(ref)) {
        continue
      }
      typed(
        { at, sym: b.id as SymbolId, named: table.resolve(b, ref) },
        USED | ERASED,
        true,
        false,
      )
    }
  }

  /** The bits each cluster's text was read with. */
  const clusterDone = new Map<ClusterId, number>()
  /** A top-level declaration's text: its cluster's (what placement moves as one). */
  const readCluster = (c: ClusterId, b: number) => {
    const before = clusterDone.get(c) ?? 0
    if ((before | b) === before) {
      return
    }
    clusterDone.set(c, before | b)
    const cl = clusters[c]!
    // by value everything flows. In a type position the R163 cause flows
    // along erasure only (a helper erased text reached names a class in its
    // signature); text another output claims names in a type for itself
    const relay = (b & ERASED) !== 0
    const type = relay ? b : b & ~NAMED
    // what its text names in the source, rendered or not: the index
    // placement reads every cluster's text through (`reads.ts`), generated
    // text and the places of claims included
    // (a local a top-level declaration's text reads is declared inside it;
    // TypeScript's text, a `declare`, stays as written: the imports it
    // reads are the host's unless removed text leads to it)
    const imports =
      (b & REMOVED) !== 0 || cl.units.some((u) => units[u]!.kind !== 'type')
    for (const s of a.reads.clusterReads(c, 'env', false)) {
      if (cl.declares.has(s)) {
        out.selfReading.add(c)
      }
      if (symbols.isModuleLevel(s) && (imports || !symbols.isImport(s))) {
        reach(s, b)
      }
    }
    if (!types.any) {
      return
    }
    for (const u of cl.units) {
      const unit = units[u]!
      // (a type unit is TypeScript's text: a type-only namespace that
      // shares the value's name is not named by a use of the value, and a
      // `declare` of the value is read with the binding, below)
      if (unit.kind === 'import-specifier' || unit.kind === 'type') {
        continue
      }
      types.in(
        unit.range,
        (ref) => {
          // (the references of this cluster's text, not of text another
          // cluster owns inside it)
          const region = rewrites.regions.innermostAt(ref.at)
          if (
            region !== null &&
            graph.clusterOfRegion.get(region) === c &&
            clusterOfSym.get(ref.sym) !== c &&
            !inside(ref.sym, unit.range)
          ) {
            typed(ref, type, relay)
          }
        },
        true,
      )
    }
  }

  const below = new Set<SymbolId>()
  while (work.length > 0) {
    const s = work.pop()!
    const cause = bits[s]! & CAUSES
    if (cause === bits[s]! >> 4) {
      continue
    }
    bits[s] = cause | (cause << 4)
    const kind = symbols.kind(s)
    if (kind === 'generated') {
      const c = clusterOfSym.get(s)
      if (c !== undefined) {
        readCluster(c, cause)
      }
      continue
    }
    const binding = symbols.binding(s)
    // (a generated or synthetic symbol has no binding; an ambient one is
    // read like any other)
    if (binding === null) {
      continue
    }
    if (!hasRuntimeValue(binding)) {
      // a type declaration text reads by its name (the right side of an
      // `import X = A.B` that is read as text): what it names was used too
      for (const d of table.of(binding)) {
        if (d.kind === 'erased' && d.spaces !== 0) {
          follow(d.node, cause, true)
        }
      }
      continue
    }
    // a `declare` of the value has no code: its text is the value's
    for (const d of table.ambient(binding)) {
      const relay = (cause & ERASED) !== 0
      // (its text stays as written: the imports it names are the host's
      // unless removed text leads to it)
      readText(
        d.node,
        cause,
        relay ? cause : cause & ~NAMED,
        relay,
        false,
        (cause & REMOVED) !== 0,
      )
    }
    if (symbols.isModuleLevel(s)) {
      const c = clusterOfSym.get(s)
      if (c !== undefined) {
        readCluster(c, cause)
      }
    }
    if (!a.below(s)) {
      continue
    }
    const defs = a.defs()
    if (!defs.define(s)) {
      continue
    }
    below.add(s)
    for (const d of defs.ofSym.get(s)!) {
      const root = defs.rootOf(d)
      if (!root.unit) {
        // (a unit's text is its cluster's, read above)
        const relay = (cause & ERASED) !== 0
        readText(root, cause, relay ? cause : cause & ~NAMED, relay, true)
      }
    }
  }

  for (const s of reached) {
    const c = clusterOfSym.get(s)
    if (c === undefined) {
      continue
    }
    out.fromRemoved.add(c)
    if ((bits[s]! & NAMED) !== 0) {
      out.erasedUse.add(c)
    }
  }
  // (an alias named for a type is a candidate like what was reached, at the
  // top level and below it; its statement was not read)
  for (const s of aliases) {
    const c = clusterOfSym.get(s)
    if (c !== undefined) {
      out.fromRemoved.add(c)
    } else if (a.below(s) && a.defs().define(s)) {
      below.add(s)
    }
  }
  out.below = [...below]
  return out
}

/**
 * The module-level bindings the source references at all, by value or in a
 * type (an export is a use): what an import already unused is not.
 */
export function sourceUses(input: PlacementInput, s: SymbolId): boolean {
  const { refs, symbols } = input.t1
  for (const ref of refs.refsOf(s)) {
    if (NEED_KINDS.has(ref.kind)) {
      return true
    }
  }
  for (const ref of symbols.binding(s)?.references ?? []) {
    if (ref.inTypePosition) {
      return true
    }
  }
  return false
}
