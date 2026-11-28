/**
 * Placement, a generic service: planners supply roots and derived outputs;
 * the core decides what each output contains and what it imports, for every
 * plan (R155). A route file (`PlanContext.setRouteModule`):
 * what route code splitting on `main` does, by its outcome, on the core's
 * analysis (spec-main-splitting 1.1-1.8). Any other plan (a server fn's
 * handler module, the RSC provider copy, erasure only) by the same rules,
 * with no name a chunk imports and none `main` shares.
 *
 * - The env module (the route file) only loses what the split made unused
 *   (`main`'s rule, the R153 amendment): a declaration or import specifier
 *   the source used, by value or in a type, from text the env module no
 *   longer holds (a claimed option value, erased text: `removal/`)
 *   leaves it, with its initialiser, when nothing that stays reads it by
 *   value; enums and namespaces are declarations like any other (R155),
 *   but in a route module splitting removes no class, `enum` or
 *   `namespace`, as `main`'s removal rule never removes one; only erasure
 *   does (R163, `classStays`).
 *   A fixed home says where a generated declaration lives, not whether it
 *   does: a claim's owner whose output no longer keeps the claim is unused.
 *   Statements (R154), exports and code already unused stay; an import
 *   already unused (a bare one included)
 *   moves to the shared module when the env module imports it, a
 *   declaration stays in the env module only.
 * - The names `main` shares (`RouteModule.shared`) and nothing else live in
 *   the shared module, as in `main`'s `?tsr-shared=1`: the env module and the
 *   chunks import them from it, and the env module re-exports the exported
 *   ones. One code outside the set assigns, or one reading a declaration
 *   outside the set, leaves the set and is placed like any declaration.
 * - A split chunk takes what its option's value reads, transitively. What
 *   the env module also keeps, the chunk imports from it when `main`
 *   imports it (the route binding, `export const|let|var`:
 *   `RouteModule.imported`) and copies otherwise, with the top-level code
 *   reaching what it copies through the names it references (R1: the
 *   statements, classes, enums, namespaces (R163) and the declarations the
 *   source never read whose names reach it,
 *   transitively; `main`'s second instance, in `main`'s shapes, 1.8); so it
 *   copies what the env module does not keep, also what another chunk
 *   copies too. Import specifiers are copied where they are read.
 * - A planner renders its text in split chunks with a `{ kinds }` scope
 *   (Start's caller copy of a server fn, R159).
 * - A `<Hydrate>` chunk copies every declaration its children reach, by
 *   binding and transitively, exported or not, and no top-level statement
 *   (H1, spec-phase2-hydrate). It imports only what cannot be a copy (H2): a
 *   binding its planner names (`OutputDecl.imported`: a declaration leading
 *   back to the boundary, a recursive component) and the route binding
 *   (`RouteModule.route`), a name a statement declares and a declaration
 *   such a statement reads, what another module of the file holds (a shared
 *   name, a generated declaration with its own home). Code that left the env
 *   module assigning such an import, or its copy of a binding the env module
 *   keeps, falls back (H4).
 * - Another planner's derived output (a server function's handler module)
 *   imports what the env module keeps; what it alone needs moves there; a
 *   provider output (another layer's instance of the module) copies what
 *   it reaches (R157).
 * - A declaration a planner's lazy module (`custom`: Start's server-fn
 *   handler module) reaches stays in the env module when evaluating it
 *   reads, by name and transitively, something the env module keeps: it
 *   runs at load, as in the source; a declaration that is exactly a
 *   function evaluates nothing and moves (R157 rule 4, `pinned`).
 * - A derived output that would assign a binding it imports (`main` fails
 *   such a build: a shared `let`, an `export let`) does not take the root
 *   bringing that code: the root falls back (`Placement.fallbacks`) and its
 *   planner keeps it in place.
 */
import { deriveId } from './identity'
import { buildClusters, writeAssigns } from './clusters'
import { readIndex } from './reads'
import { NAMESPACE, TYPE } from './declarations'
import { Removal, sourceUses } from './removal/index'
import type { SourceFile } from 'yuku'
import type { Cluster, ClusterId } from './clusters'
import type { Tier1 } from './analysis'
import type { SymbolId } from './symbols'
import type { RegionId, UnitId } from './units'
import type { GenUnitId, OutputId, RewriteSet } from './rewrite'

export type RootRef =
  | { t: 'unit'; id: UnitId }
  | { t: 'gen'; id: GenUnitId }
  /** A module binding a derived output's root reads as its value. */
  | { t: 'sym'; id: SymbolId }

export type OutputKind =
  | 'env'
  | 'split'
  | 'shared'
  | 'hydrate'
  | 'provider'
  | 'custom'

export interface HeaderPolicy {
  dropDirectives?: ReadonlyArray<string>
  addDirective?: string
}

export interface OutputDecl {
  id: OutputId
  kind: OutputKind
  /** Short key for shared-module ids and diagnostics (`component`, `h1`, …). */
  key: string
  /** The derived canonical id (null for env). */
  derivedId: string | null
  roots: Array<RootRef>
  header?: HeaderPolicy
  /**
   * A `hydrate` output: the module bindings it imports from the module that
   * holds them; it copies the others (H2 (a), spec-phase2-hydrate: the per-output
   * form of `RouteModule.imported`).
   */
  imported?: ReadonlySet<SymbolId>
}

export type Home = OutputId | 'removed'

/** A region a derived output must not take: it would assign a binding it imports, or (a `<Hydrate>` chunk) its copy of one the env module keeps. */
export interface Fallback {
  region: RegionId
  /** The first assignment the root's code would make (what a planner's diagnostic names). */
  write: SharedWrite
}

/** An assignment a derived output cannot make: of `sym`, at offset `at`, which the output would import (else assign its copy). */
export interface SharedWrite {
  sym: SymbolId
  at: number
  imported: boolean
}

export interface PlacementInput {
  t1: Tier1
  rewrites: RewriteSet
  outputs: Map<OutputId, OutputDecl>
  canonicalId: string
  /** The module's text. */
  code: string
  /** The module's file (ephemeral: the definitions below the units, `removal/`). */
  file: SourceFile
  /** A route file (`PlanContext.setRouteModule`): placed as route splitting on `main` places it. */
  routeModule: RouteModule | null
}

/** A route file's placement input (`PlanContext.setRouteModule`). */
export interface RouteModule {
  /** The module bindings a split chunk imports from the route module when it reads them (it copies the others). */
  imported: ReadonlySet<SymbolId>
  /** The names `main` shares (`computeSharedBindings`): an exported one only chunks read moves to the shared module, which the route module re-exports it from. */
  shared: ReadonlySet<SymbolId>
  /** The route binding (`Route`): a `<Hydrate>` chunk imports it too, whatever encloses the boundary (H2 (a)). */
  route?: SymbolId
}

export interface Placement {
  clusterOfRegion: Map<RegionId, ClusterId>
  clusterOfGen: Map<GenUnitId, ClusterId>
  home: Map<ClusterId, Home>
  /** Clusters each output contains (homed or duplicated). */
  included: Map<OutputId, Set<ClusterId>>
  /** o → (home output → symbols o imports from it). */
  imports: Map<OutputId, Map<OutputId, Set<SymbolId>>>
  /** Symbols each output must export for other outputs. */
  exportsNeeded: Map<OutputId, Set<SymbolId>>
  fallbacks: Array<Fallback>
  /** `main`'s shared module, which placement creates when a shared name is read: the env module and the chunks import those names from it. */
  shared: OutputDecl | null
  /** The exported symbols the shared module holds (the env module re-exports them from it). */
  sharedExports: Array<SymbolId>
}

/** A plan that is no route file: no name a chunk imports, none `main` shares. */
const NO_ROUTE: RouteModule = { imported: new Set(), shared: new Set() }

export function computePlacement(input: PlacementInput): Placement {
  const { t1, rewrites, outputs } = input
  const {
    imported,
    shared: sharedNames,
    route: routeBinding,
  } = input.routeModule ?? NO_ROUTE
  const { units, items } = t1
  const graph = buildClusters(input)
  const reads = readIndex(input, graph)
  const { clusters, clusterOfSym } = graph
  const gens = rewrites.generated
  /**
   * The removal rule on generated code: a fixed home says where a generated
   * declaration lives, not whether it does. The owner of a claim exists for
   * its placeholder and for generated code that reads it; when the output it
   * lives in keeps neither (`hasClaim`: an erasure removed the occurrence,
   * e.g. a `<Hydrate>` boundary in a route option the router deletes on the
   * client), our changes made it unused: no root, no home, not rendered.
   */
  const unused = new Set<GenUnitId>()
  const findUnused = () => {
    unused.clear()
    for (const claim of rewrites.claims.values()) {
      const h = gens[claim.owner]!.home
      if (
        typeof h === 'string' &&
        !graph.viewOf(h === 'auto' ? 'env' : h).hasClaim(claim.region)
      ) {
        unused.add(claim.owner)
      }
    }
  }
  findUnused()
  const liveRoots = (o: OutputDecl): ReadonlyArray<RootRef> =>
    o.roots.filter((r) => r.t !== 'gen' || !unused.has(r.id))
  /** The roots of a derived output: what its planners rooted there, and the generated units homed there. */
  const rootsOf = (o: OutputDecl): Array<RootRef> => [
    ...liveRoots(o),
    ...gens
      .filter((g) => g.home === o.id && !unused.has(g.id))
      .map((g) => ({ t: 'gen' as const, id: g.id })),
  ]
  const clusterOfRoot = (r: RootRef): ClusterId | undefined =>
    r.t === 'unit'
      ? graph.clusterOfRegion.get(units[r.id]!.region)
      : r.t === 'gen'
        ? graph.clusterOfGen.get(r.id)
        : clusterOfSym.get(r.id)

  // ---- what each cluster is -------------------------------------------------
  /** The output a generated unit is homed in by its planner. */
  const fixedHome = new Map<ClusterId, OutputId>()
  /** Generated units with `env-readers` homes (decided last). */
  const envReaders: Array<ClusterId> = []
  /** `removable`, per cluster, for the homes as they are. */
  let removables: Array<boolean | undefined> = []
  const findHomes = () => {
    fixedHome.clear()
    envReaders.length = 0
    removables = []
    for (const g of gens) {
      const c = graph.clusterOfGen.get(g.id)!
      if (unused.has(g.id)) {
        continue
      }
      if (typeof g.home === 'string' && g.home !== 'auto') {
        fixedHome.set(c, g.home)
      } else if (typeof g.home === 'object') {
        envReaders.push(c)
      }
    }
  }
  findHomes()
  /**
   * `main`'s removal rule applies to it: import specifiers, declarators,
   * function, class, `enum` and `namespace` declarations (R155; a `declare`
   * or type-only namespace is a type unit, filtered below), and the
   * declarations and imports planners generate without an effect, where
   * they are read (a planner's `auto` home).
   */
  const removable = (c: ClusterId): boolean => {
    let known = removables[c]
    if (known === undefined) {
      known = removables[c] = isRemovable(c)
    }
    return known
  }
  const isRemovable = (c: ClusterId): boolean => {
    const cl = clusters[c]!
    if (fixedHome.has(c) || envReaders.includes(c)) {
      return false
    }
    if (cl.units.length === 0) {
      // a declaration or an import a planner generates; one with an effect
      // (route HMR's block, with its own helper import) is a statement
      return cl.gens.every(
        (g) =>
          !gens[g]!.effectful &&
          (gens[g]!.declares.length > 0 || (gens[g]!.imports ?? []).length > 0),
      )
    }
    // (a type merged with the binding and `import { type X }` beside
    // `function X` are TypeScript's: they decide nothing)
    return cl.units.every((u) => {
      const unit = units[u]!
      if (unit.kind === 'type' || unit.kind === 'import-specifier') {
        return true
      }
      if (unit.kind !== 'declaration') {
        return false
      }
      // a definition, by the one table (`declarations.ts`; `using`
      // disposes what it declares: a statement)
      return unit.definition
    })
  }
  const isType = (c: ClusterId) => clusters[c]!.kind === 'type'
  /** A class, `enum` or `namespace` declaration: a value that is a type or a namespace too (R163; a type-only namespace is a type unit). */
  const isClassLike = (c: ClusterId) =>
    clusters[c]!.units.some(
      (u) =>
        units[u]!.kind === 'declaration' &&
        (units[u]!.spaces & (TYPE | NAMESPACE)) !== 0,
    )
  /** Copied where it is read: an import specifier, a planner's generated import. */
  const isImport = (c: ClusterId) => clusters[c]!.kind === 'import'

  /**
   * What a split chunk imports from the env module rather than copying it,
   * as `main`'s router splitter does (`RouteModule.imported`).
   */
  const importedFromEnv = (c: ClusterId) =>
    [...clusters[c]!.declares].some((s) => imported.has(s))

  // ---- the env module --------------------------------------------------------
  const derived = [...outputs.values()].filter((o) => o.id !== 'env')
  const rootedElsewhere = new Set<ClusterId>()
  const findRooted = () => {
    rootedElsewhere.clear()
    for (const o of derived) {
      for (const r of liveRoots(o)) {
        if (r.t === 'gen') {
          rootedElsewhere.add(graph.clusterOfGen.get(r.id)!)
        }
      }
    }
  }
  findRooted()
  /**
   * The removal rule's first half, once: what the source used from text the
   * env module no longer holds (`fromRemoved`), and what erased text names
   * (`erasedUse`, R163). Read from the source and the planners' edits alone,
   * so it comes before anything reads the tree.
   */
  const removal = new Removal(input, graph, reads, removable)
  /**
   * Whether the env module keeps a cluster whatever reads it: a statement or
   * an export stays (R154), and so does what the source did not read from
   * text the env module no longer holds (code already unused stays); the
   * rest stays when something that stays reaches it. `classStays` is R163's
   * clause: before placement has read the tree (`removal.decide`), a class
   * erased text does not name; after, also one a split chunk reads.
   */
  const envKeeps = (
    cl: Cluster,
    used: ReadonlySet<ClusterId>,
    classStays: (c: ClusterId) => boolean,
  ): boolean => {
    const c = cl.id
    if (
      envReaders.includes(c) ||
      isType(c) ||
      cl.gens.some((g) => unused.has(g))
    ) {
      return false
    }
    if (fixedHome.get(c) === 'env') {
      return true
    }
    if (fixedHome.has(c)) {
      return false
    }
    if (cl.units.length > 0) {
      // (an exported shared declaration: the env module re-exports it
      // from the shared module)
      return (
        !removable(c) ||
        cl.units.some((u) => units[u]!.exported.length > 0) ||
        !used.has(c) ||
        removal.keep.has(c) ||
        classStays(c)
      )
    }
    // a planner's generated effect no output roots
    return !removable(c) && !rootedElsewhere.has(c) && cl.gens.length > 0
  }
  // the definitions below the units, decided with the clusters in one mark
  // from these roots; what it removes changes which claims an output keeps
  if (removal.pending) {
    const classRoot = (c: ClusterId) =>
      input.routeModule !== null && isClassLike(c) && !removal.erasedUse.has(c)
    const changed = removal.decide({
      keeps: (cl) => envKeeps(cl, removal.fromRemoved, classRoot),
      every: () => [...outputs.get('env')!.roots, ...derived.flatMap(rootsOf)],
      env: () => [
        ...outputs.get('env')!.roots,
        ...derived.filter((o) => o.kind !== 'provider').flatMap(rootsOf),
      ],
      clusterOfRoot,
      copies: derived.some((o) => o.kind === 'provider'),
    })
    if (changed) {
      // what the tree now holds: the claims an output keeps, and its text
      findUnused()
      findHomes()
      findRooted()
      reads.treeChanged()
    }
  }
  /**
   * The declarations of names `main` shares (`RouteModule.shared`): they, and
   * nothing else, live in the shared module, which the env module and the
   * chunks import them from, as `main`'s `?tsr-shared=1`. (`main`'s step 5,
   * no name whose declaration reads `Route`, transitively, is the
   * planner's.) One fixed point, removals only, keeps the set closed:
   * - a name leaves when code outside the set assigns it, wherever that code
   *   is (the env module, a chunk, another planner's output): that module
   *   would assign an import, where `main` fails;
   * - a name leaves when its declaration reads a declaration outside the
   *   set (a `var` in a statement, a dropped name), so the shared module
   *   imports nothing of the file. This follows from R154 (statements stay
   *   in the env module), not from `main`'s closure, which only adds names;
   *   `main` emits a missing name there;
   * - a planner's generated declaration with no fixed home that the env
   *   module does not root (a `<Hydrate>` importer) is in the set while a
   *   member reads it.
   * A dropped name is placed like any declaration: it stays in the env
   * module only when something left there uses it; a chunk needing it
   * otherwise copies it.
   */
  const inShared = new Set<ClusterId>()
  const envView = graph.viewOf('env')
  {
    const envRooted = new Set(
      outputs
        .get('env')!
        .roots.flatMap((r) =>
          r.t === 'gen' ? [graph.clusterOfGen.get(r.id)!] : [],
        ),
    )
    const generated = new Set<ClusterId>()
    for (const cl of clusters) {
      if (
        cl.declares.size === 0 ||
        !removable(cl.id) ||
        isImport(cl.id) ||
        fixedHome.has(cl.id)
      ) {
        continue
      }
      if (cl.units.length > 0) {
        if ([...cl.declares].every((s) => sharedNames.has(s))) {
          inShared.add(cl.id)
        }
      } else if (!envRooted.has(cl.id) && !envReaders.includes(cl.id)) {
        generated.add(cl.id)
        inShared.add(cl.id)
      }
    }
    /**
     * What each member reads, on the env module's view. The shared module's
     * own view (`reachFrom`'s `SHARED`) differs where a claim is scoped away
     * from the env module: start-env's hoist homed in an RSC provider output
     * (`except: ['env']`) applies there and not here. Read there, a route's
     * server fn `main` shares leaves the set in the RSC env; this view keeps
     * it in the shared module (the outputs at R170).
     */
    const readsOf = new Map<ClusterId, Array<ClusterId>>()
    for (const c of inShared) {
      const r = reads.clusterReads(c, 'env', true)
      readsOf.set(
        c,
        [...r].flatMap((s) => {
          const t = clusterOfSym.get(s)
          return t === undefined || t === c ? [] : [t]
        }),
      )
    }
    /** The members reading each declaration (a generated one no member reads leaves). */
    const readersOf = new Map<ClusterId, Array<ClusterId>>()
    for (const [m, targets] of readsOf) {
      for (const t of targets) {
        let readers = readersOf.get(t)
        if (!readers) {
          readersOf.set(t, (readers = []))
        }
        readers.push(m)
      }
    }
    for (let changed = true; changed; ) {
      changed = false
      for (const c of inShared) {
        // (a read of a generated declaration homed in another derived
        // output imports it from there: no module the env module imports)
        const readsOutside = readsOf
          .get(c)!
          .some(
            (t) =>
              !isType(t) &&
              !isImport(t) &&
              !inShared.has(t) &&
              !(fixedHome.has(t) && fixedHome.get(t) !== 'env'),
          )
        const assignedOutside = [...clusters[c]!.declares].some((s) =>
          (graph.writesOfSym.get(s) ?? []).some((w) => {
            // (code the env module erases, a server function's handler on
            // the client, writes nothing in this environment; a Solid ref
            // on a callback only beside a kept explicit write)
            if (!writeAssigns(graph, w, (at) => envView.isErasedAt(at))) {
              return false
            }
            const by =
              w.owner === null ? undefined : graph.clusterOfRegion.get(w.owner)
            return by !== c && (by === undefined || !inShared.has(by))
          }),
        )
        const unread =
          generated.has(c) &&
          !(readersOf.get(c) ?? []).some((m) => m !== c && inShared.has(m))
        if (readsOutside || assignedOutside || unread) {
          inShared.delete(c)
          changed = true
        }
      }
    }
  }
  /** What the source reads from text the env module no longer holds: erased, or claimed by a chunk. */
  const { fromRemoved, erasedUse } = removal
  /**
   * R163: `main`'s removal rule never removes a class, an enum or a
   * namespace, so its body runs when the route module loads. In a route
   * module splitting never removes one, whatever names it (by value or in a
   * type, in split or kept text); a chunk reading it copies it, as on
   * `main`, and a name `main` shares lives in the shared module, as there.
   * Only erasure removes one: when text the env module erases names it, by
   * value or in a type, or text another planner's output claims (a handler
   * module, a `<Hydrate>` chunk, which takes what it reads) reads it by value
   * (`erasedUse`), and no split chunk reads it by value (`keptBySplit`):
   * leaks block whatever `main` does (round-2 (b), round-3 rulings).
   */
  const keptBySplit = new Set<ClusterId>()
  /** A class, enum or namespace the env module of a route module keeps (R163). */
  const classStays = (c: ClusterId) =>
    input.routeModule !== null &&
    isClassLike(c) &&
    !inShared.has(c) &&
    (keptBySplit.has(c) || !erasedUse.has(c))
  for (const o of derived) {
    if (o.kind !== 'split') {
      continue
    }
    const seen = new Set<ClusterId>()
    const work: Array<ClusterId> = []
    const visit = (c: ClusterId | undefined) => {
      if (
        c !== undefined &&
        !seen.has(c) &&
        !isType(c) &&
        !inShared.has(c) &&
        !importedFromEnv(c) &&
        (fixedHome.get(c) ?? o.id) === o.id
      ) {
        seen.add(c)
        work.push(c)
      }
    }
    for (const r of rootsOf(o)) {
      visit(clusterOfRoot(r))
    }
    while (work.length > 0) {
      const c = work.pop()!
      if (isClassLike(c)) {
        keptBySplit.add(c)
      }
      for (const t of reads.successors(c, o.id, true)) {
        visit(t)
      }
    }
  }
  /** The shared declarations the env module reads or exports: roots of the shared module. */
  const sharedRoots = new Set<ClusterId>()
  const env = new Set<ClusterId>()
  const envWork: Array<ClusterId> = []
  const keepInEnv = (c: ClusterId | undefined) => {
    if (c !== undefined && !env.has(c) && !isType(c)) {
      const home = fixedHome.get(c)
      if (home !== undefined && home !== 'env') {
        return
      }
      if (inShared.has(c)) {
        sharedRoots.add(c)
        return
      }
      env.add(c)
      envWork.push(c)
    }
  }
  /** What the env module keeps reads, transitively. */
  const closeEnv = () => {
    while (envWork.length > 0) {
      const r = reads.clusterReads(envWork.pop()!, 'env', true)
      for (const s of r) {
        keepInEnv(clusterOfSym.get(s))
      }
    }
  }
  for (const cl of clusters) {
    if (envKeeps(cl, fromRemoved, classStays)) {
      keepInEnv(cl.id)
    }
  }
  for (const r of outputs.get('env')!.roots) {
    keepInEnv(clusterOfRoot(r))
  }
  closeEnv()

  /**
   * A declaration that is exactly a function: evaluating it reads nothing
   * (a function declaration, a declarator of an identifier whose
   * initialiser is a function or arrow expression: a pattern reads its
   * computed keys and defaults; overload signatures and merged types decide
   * nothing).
   */
  const isFunction = (c: ClusterId) =>
    clusters[c]!.units.length > 0 &&
    clusters[c]!.units.every((u) => {
      const node = units[u]!.node
      return (
        units[u]!.kind === 'type' ||
        node.type === 'TSDeclareFunction' ||
        node.type === 'FunctionDeclaration' ||
        (node.type === 'VariableDeclarator' &&
          node.id.type === 'Identifier' &&
          (node.init?.type === 'ArrowFunctionExpression' ||
            node.init?.type === 'FunctionExpression'))
      )
    })
  /**
   * R157 rule 4, one fixed point: a declaration a planner's lazy module
   * (`custom`: Start's server-fn handler module, which imports what the env
   * module keeps) would hold, that is not exactly a function, stays in the
   * env module when evaluating it reads, by name and transitively through
   * what the lazy module would hold, a declaration the env module keeps: it
   * runs at load, where the source runs it (`const snapshot = cfg.url;
   * set(cfg)`). Names only: no value, timing or write analysis. What it
   * reads stays with it (`closeEnv`), which can pin more. Only declarations
   * of the source are state of the file (`fileState`, R158 amendment).
   */
  /**
   * A declaration of the source the env module keeps: state of the file. A
   * declaration a planner generates (Start's lazy-handler loader) is none:
   * no source code can name it, so nothing changes or observes it between
   * load and the first call, and reading it never pins.
   */
  const fileState = (t: ClusterId) =>
    env.has(t) && !isType(t) && !isImport(t) && clusters[t]!.units.length > 0
  for (const o of derived) {
    if (o.kind !== 'custom') {
      continue
    }
    for (let changed = true; changed; ) {
      changed = false
      /** What the lazy module would hold: not imported (the env module's, another home's, the shared module's), not copied (an import specifier). */
      const held = (c: ClusterId | undefined): c is ClusterId =>
        c !== undefined &&
        !isType(c) &&
        !isImport(c) &&
        !env.has(c) &&
        !inShared.has(c) &&
        (fixedHome.get(c) ?? o.id) === o.id
      /** The declarations of the env module each held declaration reads, and the held ones it reads. */
      const readsKept = new Set<ClusterId>()
      const readsHeld = new Map<ClusterId, Array<ClusterId>>()
      const work: Array<ClusterId> = []
      const visit = (c: ClusterId | undefined) => {
        if (held(c) && !readsHeld.has(c)) {
          readsHeld.set(c, [])
          work.push(c)
        }
      }
      for (const r of rootsOf(o)) {
        visit(clusterOfRoot(r))
      }
      while (work.length > 0) {
        const c = work.pop()!
        const r = reads.clusterReads(c, o.id, true)
        for (const t of [...r].map((s) => clusterOfSym.get(s))) {
          if (t === undefined || t === c) {
            continue
          }
          if (fileState(t)) {
            readsKept.add(c)
          } else if (held(t)) {
            readsHeld.get(c)!.push(t)
            visit(t)
          }
        }
      }
      for (const c of readsHeld.keys()) {
        if (fixedHome.has(c) || isFunction(c)) {
          continue
        }
        const seen = new Set([c])
        const stack = [c]
        while (stack.length > 0) {
          const x = stack.pop()!
          if (readsKept.has(x)) {
            keepInEnv(c)
            changed = true
            break
          }
          for (const t of readsHeld.get(x)!) {
            if (!seen.has(t)) {
              seen.add(t)
              stack.push(t)
            }
          }
        }
      }
      closeEnv()
    }
  }

  /**
   * A top-level statement: an effect, or `export default <expression>`
   * (it evaluates its expression; a derived output renders it as a
   * statement).
   */
  const isStatement = (c: ClusterId): boolean =>
    clusters[c]!.kind === 'effect' ||
    clusters[c]!.units.some((u) => units[u]!.kind === 'export-default')
  /**
   * The top-level code reaching each declaration the env module keeps
   * through the names it references, transitively (R1): every statement,
   * for a split chunk every class, `enum` and `namespace` (R163: `main`'s
   * removal rule never removes one), and every declaration nothing in the
   * source reads by value but its own text (`sourceRead`; an export is a
   * reference, as in `main`'s removal rule: `main`'s copy strips its exports
   * and deletes what only they read; a declaration another output reads, a
   * server fn handler's, is read; a type names nothing), whose code names
   * the declaration, or names a declaration whose code names it, and so on. A chunk copying the
   * declaration takes them, as `main`'s chunk keeps every statement reading
   * a name it still declares, every class and every never-read declaration,
   * and `main`'s provider runs the whole file. Names only: no value, call or
   * write analysis.
   */
  const sourceRead = new Set<ClusterId>()
  for (const cl of clusters) {
    for (const t of reads.successors(cl.id, 'env', false)) {
      if (t !== cl.id) {
        sourceRead.add(t)
      }
    }
  }
  const readersInEnv = new Map<ClusterId, Array<ClusterId>>()
  for (const c of env) {
    const r = reads.clusterReads(c, 'env', true)
    const named = new Set<ClusterId>()
    for (const sym of r) {
      const t = clusterOfSym.get(sym)
      if (t !== undefined) {
        named.add(t)
      }
    }
    for (const t of named) {
      if (t !== c && env.has(t)) {
        let readers = readersInEnv.get(t)
        if (!readers) {
          readersInEnv.set(t, (readers = []))
        }
        readers.push(c)
      }
    }
  }
  /** A statement declaring a name (`if (…) { var x = … }`; `export default`'s own `default` is none). */
  const declaresInStatement = (st: ClusterId) =>
    [...clusters[st]!.declares].some((d) => t1.symbols.kind(d) !== 'synthetic')
  /** A statement of the env module reading or writing `c`, a declaration it keeps, declares a name: a chunk imports `c`, not copies it (`main` deletes the declarator and runs the statement once). */
  const readByDeclaringStatement = (c: ClusterId) =>
    !isImport(c) &&
    (readersInEnv.get(c) ?? []).some(
      (st) =>
        isStatement(st) &&
        clusters[st]!.units.length > 0 &&
        declaresInStatement(st),
    )
  /**
   * What a chunk imports from the env module instead of copying it: what
   * `main` imports (a split chunk: `importedFromEnv`; a `<Hydrate>` chunk:
   * its planner's set, H2 (a)), a statement declaring a name, a declaration
   * such a statement names (`main` deletes that declarator and runs the
   * statement once; H2 (b)). A provider copy imports nothing.
   */
  const importsFromEnv = (c: ClusterId, o: OutputId) =>
    !copying(o) &&
    (isChunk(o) || isHydrate(o)) &&
    ((isHydrate(o)
      ? [...clusters[c]!.declares].some((s) => hydrateImported(o).has(s))
      : importedFromEnv(c)) ||
      (clusters[c]!.kind === 'effect' && declaresInStatement(c)) ||
      readByDeclaringStatement(c))
  const reachingCode = new Map<string, Array<ClusterId>>()
  /**
   * (The walk stops at what output `o` imports (O1): that binding is the
   * env module's one instance, already set up there; code reaching a copy
   * only through it would act on the import, not on the copy.)
   */
  const codeReaching = (t: ClusterId, o: OutputId): Array<ClusterId> => {
    const key = `${o}\u0000${t}`
    let found = reachingCode.get(key)
    if (found) {
      return found
    }
    found = []
    const seenReaders = new Set<ClusterId>([t])
    const work = [t]
    while (work.length > 0) {
      for (const r of readersInEnv.get(work.pop()!) ?? []) {
        if (seenReaders.has(r)) {
          continue
        }
        seenReaders.add(r)
        if (importsFromEnv(r, o)) {
          continue
        }
        work.push(r)
        const cl = clusters[r]!
        if (
          cl.units.length > 0 &&
          !isImport(r) &&
          !isType(r) &&
          (isStatement(r) ||
            (isChunk(o) && isClassLike(r)) ||
            (!sourceRead.has(r) &&
              cl.units.every((u) => units[u]!.exported.length === 0)))
        ) {
          found.push(r)
        }
      }
    }
    reachingCode.set(key, found)
    return found
  }

  // ---- the derived outputs: what each needs ----------------------------------
  const copying = (o: OutputId) => outputs.get(o)?.kind === 'provider'
  /**
   * A split chunk: it copies what the env module keeps but `main` would not
   * import, with the top-level code reaching it, as `main`'s chunk does.
   */
  const isChunk = (o: OutputId) => outputs.get(o)?.kind === 'split'
  /**
   * A `<Hydrate>` chunk: it copies the declarations its children reach and
   * no statement (H1); it imports what its planner names, a name a
   * statement declares and a declaration such a statement reads (H2 (a),
   * (b); the last as split chunks, KNOWN-BUGS), and what another module of the file
   * holds by the rules above (H2 (c)). No needer and no home: it holds
   * what it reached, as a provider copy does.
   */
  const isHydrate = (o: OutputId) => outputs.get(o)?.kind === 'hydrate'
  /**
   * H2 (a): what a `<Hydrate>` chunk imports by binding: its planner's set
   * (what leads back to the boundary) and the route binding, as a split
   * chunk imports it (R153's list), whatever encloses the boundary.
   */
  const hydrateImports = new Map<OutputId, ReadonlySet<SymbolId>>()
  const hydrateImported = (o: OutputId): ReadonlySet<SymbolId> => {
    let set = hydrateImports.get(o)
    if (!set) {
      set = new Set([
        ...(outputs.get(o)!.imported ?? []),
        ...(routeBinding === undefined ? [] : [routeBinding]),
      ])
      hydrateImports.set(o, set)
    }
    return set
  }
  const SHARED = 'shared' as OutputId
  /** The shared declarations derived outputs read, and the outputs reading them. */
  const sharedRead = new Set<ClusterId>()
  const sharedReaders = new Set<OutputId>()
  /**
   * What output `o` takes from `roots`, transitively: everything they read
   * but types and what another module of the file holds (a generated
   * unit's own home; the env module, but what a chunk copies from it:
   * imported).
   */
  const reachFrom = (
    o: OutputId,
    roots: ReadonlyArray<RootRef>,
  ): Set<ClusterId> => {
    const seen = new Set<ClusterId>()
    const work: Array<ClusterId> = []
    const take = (c: ClusterId) => {
      if (!seen.has(c)) {
        seen.add(c)
        work.push(c)
      }
    }
    const read = (t: ClusterId | undefined) => {
      if (t === undefined || seen.has(t) || isType(t)) {
        return
      }
      const home = fixedHome.get(t)
      if (home !== undefined && home !== o) {
        return // imported from its home
      }
      if (inShared.has(t) && o !== SHARED) {
        sharedRead.add(t)
        sharedReaders.add(o)
        return // imported from the shared module
      }
      if (env.has(t) && !isImport(t)) {
        // (so is what a statement declaring a `var` names, `if (…) { var
        // flag = … }`: `main` deletes that declarator from the route file,
        // which runs the rest of the statement; a copy of the statement
        // would run it twice)
        if (
          !copying(o) &&
          ((!isChunk(o) && !isHydrate(o)) ||
            importsFromEnv(t, o) ||
            clusters[t]!.kind === 'effect')
        ) {
          return // imported from the env module
        }
        // copied (a chunk, a provider copy), with the top-level code
        // reaching it: a statement as it stands, a declaration by these same
        // rules (taken first: two classes may reach each other); a
        // `<Hydrate>` chunk copies the declaration alone (H1)
        take(t)
        if (!isHydrate(o)) {
          for (const c of codeReaching(t, o)) {
            if (isStatement(c)) {
              take(c)
            } else {
              read(c)
            }
          }
        }
      }
      take(t)
    }
    for (const r of roots) {
      if (r.t === 'sym') {
        read(clusterOfRoot(r))
      } else {
        take(clusterOfRoot(r)!)
      }
    }
    while (work.length > 0) {
      const c = work.pop()!
      const r = reads.clusterReads(c, o, true)
      for (const s of r) {
        read(clusterOfSym.get(s))
      }
    }
    return seen
  }
  /**
   * The output of another planner (not copying, not a chunk: Start's
   * server-fn handler module, one per file) reaching each declaration the
   * env module does not keep: its home. A chunk copies what it reaches, as
   * on `main`; a split chunk is a home only of what no other output needs.
   */
  const needer = new Map<ClusterId, OutputId>()
  const reached = new Map<OutputId, Set<ClusterId>>()
  const chunkOwner = new Map<ClusterId, OutputId>()
  for (const o of derived) {
    const seen = reachFrom(o.id, rootsOf(o))
    reached.set(o.id, seen)
    if (copying(o.id) || isHydrate(o.id)) {
      continue
    }
    for (const c of seen) {
      if (isImport(c) || fixedHome.has(c) || env.has(c)) {
        continue
      }
      if (isChunk(o.id)) {
        if (!chunkOwner.has(c)) {
          chunkOwner.set(c, o.id)
        }
      } else if (!needer.has(c)) {
        needer.set(c, o.id)
      }
    }
  }

  // ---- homes ------------------------------------------------------------------
  const home = new Map<ClusterId, Home>()
  // `main`'s shared module: the shared names the env module or a chunk reads
  let shared: OutputDecl | null = null
  {
    const used = reachFrom(
      SHARED,
      [...sharedRoots, ...sharedRead].map((c) => ({
        t: 'sym' as const,
        id: [...clusters[c]!.declares][0]!,
      })),
    )
    const held = [...used].filter((c) => !isImport(c))
    if (held.length > 0) {
      const key =
        derived
          .filter((o) => sharedReaders.has(o.id))
          .map((o) => o.key)
          .sort()
          .join('+') || 'route'
      const derivedId = deriveId(input.canonicalId, {
        kind: 'shared',
        value: key,
      })
      shared = {
        id: `derived:${derivedId}`,
        kind: 'shared',
        key: `shared~${key}`,
        derivedId,
        roots: [],
      }
      for (const c of held) {
        home.set(c, shared.id)
      }
    }
  }
  /**
   * The imports already unused in the source: an import nothing in the
   * source references, by value or in a type (an export is a use), a bare
   * `import './polyfill'` or `import './a.css'` included. When the env
   * module reads a shared name (its first import is then the shared
   * module's), they move there, in source order with its own imports: they
   * run once, with the shared module's imports, so a module a shared
   * declaration reads still runs after a bare import written before it. They
   * then run before every import and re-export the env module keeps, those
   * the source wrote before them included (`export * from './a'; import
   * './b'` runs `./b` first), as on main. Otherwise they stay in the env
   * module. Chunks and
   * Start's derived outputs load after the env module has run and get none.
   * Only what the source wrote (not a planner's generated import, the route
   * module's `lazyRouteComponent`). A declaration already unused stays in
   * the route module only: nothing can read it, and a copy would run its
   * effect again.
   */
  const unusedImports: Array<ClusterId> = []
  if (shared !== null) {
    const used = (cl: Cluster) =>
      [...cl.declares].some((s) => sourceUses(input, s))
    for (const cl of clusters) {
      if (
        cl.units.length > 0 &&
        (cl.kind === 'import-effect' ||
          (cl.kind === 'import' &&
            !used(cl) &&
            removable(cl.id) &&
            !cl.units.some((u) => units[u]!.exported.length > 0)))
      ) {
        unusedImports.push(cl.id)
      }
    }
  }
  // what another planner's output needs lives there
  for (const [c, o] of needer) {
    home.set(c, o)
  }
  for (const [c, o] of chunkOwner) {
    if (!home.has(c)) {
      home.set(c, o)
    }
  }
  for (const c of env) {
    home.set(c, 'env')
  }
  for (const [c, h] of fixedHome) {
    home.set(c, h)
  }
  for (const cl of clusters) {
    if (!home.has(cl.id) && !isImport(cl.id)) {
      home.set(cl.id, 'removed')
    }
  }

  // ---- inclusion and imports ----------------------------------------------------
  const included = new Map<OutputId, Set<ClusterId>>()
  const imports = new Map<OutputId, Map<OutputId, Set<SymbolId>>>()
  const exportsNeeded = new Map<OutputId, Set<SymbolId>>()
  const importFrom = (o: OutputId, h: OutputId, s: SymbolId) => {
    let byHome = imports.get(o)
    if (!byHome) {
      imports.set(o, (byHome = new Map()))
    }
    let syms = byHome.get(h)
    if (!syms) {
      byHome.set(h, (syms = new Set()))
    }
    syms.add(s)
    let exported = exportsNeeded.get(h)
    if (!exported) {
      exportsNeeded.set(h, (exported = new Set()))
    }
    exported.add(s)
  }
  included.set('env', env)
  const all: Array<OutputId> = [
    ...derived.map((o) => o.id),
    ...(shared !== null ? [shared.id] : []),
  ]
  for (const o of all) {
    const set = new Set<ClusterId>()
    included.set(o, set)
    if (copying(o)) {
      for (const c of reached.get(o)!) {
        set.add(c)
      }
    } else {
      for (const [c, h] of home) {
        if (h === o) {
          set.add(c)
        }
      }
      // what a chunk copies (from the env module, or a declaration another
      // module holds too)
      if (isChunk(o) || isHydrate(o)) {
        for (const c of reached.get(o)!) {
          set.add(c)
        }
      }
      if (o === shared?.id) {
        for (const c of unusedImports) {
          set.add(c)
        }
      }
    }
  }
  // what each output reads that it does not hold: imported from its home
  // (an import specifier is copied where it is read)
  for (const o of ['env' as OutputId, ...all]) {
    const set = included.get(o)!
    const work = [...set]
    while (work.length > 0) {
      const c = work.pop()!
      for (const s of reads.clusterReads(c, o, true)) {
        const t = clusterOfSym.get(s)
        if (t === undefined || set.has(t) || isType(t)) {
          continue
        }
        const h = home.get(t)
        if (isImport(t) || h === undefined || h === 'removed' || h === o) {
          // (a read of what no output holds: as `main`, the name stays unbound)
          if (isImport(t)) {
            set.add(t)
            work.push(t)
          }
          continue
        }
        importFrom(o, h, s)
      }
    }
  }
  // route HMR's registration: every derived output importing a binding of
  // the env module other than the ones it names, or a binding of the shared
  // module the env module reads (state the env module's code writes)
  const envShared = new Set(
    [...sharedRoots].flatMap((c) => [...clusters[c]!.declares]),
  )
  for (const c of envReaders) {
    const besides = new Set(
      clusters[c]!.gens.flatMap((g) => {
        const h = gens[g]!.home
        return typeof h === 'object' ? [...h.besides] : []
      }),
    )
    for (const o of all) {
      const fromEnv = imports.get(o)?.get('env')
      const fromShared =
        shared === null || o === shared.id
          ? undefined
          : imports.get(o)?.get(shared.id)
      if (
        (fromEnv && [...fromEnv].some((s) => !besides.has(s))) ||
        (fromShared && [...fromShared].some((s) => envShared.has(s)))
      ) {
        included.get(o)!.add(c)
      }
    }
  }

  // ---- an output that would assign a binding it imports, or its copy -------
  // A module cannot assign a binding it imports: a derived output that would
  // assign (`=`, `++`, `+=`, …) a binding another module of the file holds
  // does not take the root that brings that code (a split option's value, a
  // server function's handler, `<Hydrate>` children). The root falls back:
  // its planner keeps it in place in the next round. Its copy analogue (H4):
  // an output whose code assigns its copy of a binding another derived output
  // holds too (two split chunks copying a `let` one of them assigns), or, for
  // a `<Hydrate>` chunk, the env module keeps, falls back alike (the copy
  // would be written, the other module's read); an output that holds the
  // writing code too (a helper both call) writes its own copy. A split chunk
  // imports from the env module what `main` shares and copies the rest, as
  // `main`'s chunk does (R153). One check of the outcome, on the write table
  // every placement shares.
  /** Another output holding `d` but not the code `c` assigning it: it reads its own `d`, which `h`'s copy of the code never writes. */
  const holdsUnwritten = (h: OutputId, d: ClusterId, c: ClusterId) =>
    [...(isHydrate(h) ? ['env' as OutputId] : []), ...all].some((o) => {
      const set = included.get(o)!
      return o !== h && !copying(o) && set.has(d) && !set.has(c)
    })
  // (each writing cluster with its first such assignment)
  const writers = new Map<ClusterId, SharedWrite>()
  for (const w of graph.writes) {
    const c = w.owner === null ? undefined : graph.clusterOfRegion.get(w.owner)
    const d = clusterOfSym.get(w.sym)
    if (c === undefined || d === undefined || c === d) {
      continue
    }
    for (const h of all) {
      const set = included.get(h)!
      if (
        !copying(h) &&
        set.has(c) &&
        // its copy, which another output holds unwritten; or the binding
        // it imports (one the env module removes is nobody's to import)
        (set.has(d) ? holdsUnwritten(h, d, c) : home.get(d) !== 'removed') &&
        // (a write in text that output erases, a client's stubbed server-fn
        // handler, assigns nothing there)
        writeAssigns(graph, w, (at) => graph.viewOf(h).isErasedAt(at))
      ) {
        const first = writers.get(c)
        if (first === undefined || w.at < first.at) {
          writers.set(c, { sym: w.sym, at: w.at, imported: !set.has(d) })
        }
      }
    }
  }
  const fallbacks: Array<Fallback> = []
  if (writers.size > 0) {
    const fellBack = new Set<RegionId>()
    const fallBack = (region: RegionId, write: SharedWrite) => {
      if (!fellBack.has(region)) {
        fellBack.add(region)
        fallbacks.push({ region, write })
      }
    }
    for (const o of derived) {
      if (copying(o.id)) {
        continue
      }
      for (const root of rootsOf(o)) {
        let write: SharedWrite | undefined
        for (const c of reachFrom(o.id, [root])) {
          const w = writers.get(c)
          if (w !== undefined && (write === undefined || w.at < write.at)) {
            write = w
          }
        }
        if (write === undefined) {
          continue
        }
        // the root's place in the source: its claimed text, or the
        // declaration of the binding it names
        if (root.t === 'gen') {
          for (const r of clusters[graph.clusterOfGen.get(root.id)!]!.regions) {
            if (rewrites.claims.has(r)) {
              fallBack(r, write)
            }
          }
        } else if (root.t === 'sym') {
          for (const u of t1.declaringUnits.get(root.id) ?? []) {
            if (units[u]!.kind !== 'type') {
              fallBack(units[u]!.region, write)
            }
          }
        } else {
          fallBack(units[root.id]!.region, write)
        }
      }
    }
  }

  // ---- the shared exports: re-exported by the env module ---------------------
  const sharedExports: Array<SymbolId> = []
  if (shared !== null) {
    const { id } = shared
    const syms = [...sharedRoots]
      .filter(
        (c) =>
          home.get(c) === id &&
          clusters[c]!.units.some((u) => units[u]!.exported.length > 0),
      )
      .flatMap((c) => [...clusters[c]!.declares])
    if (syms.length > 0) {
      sharedExports.push(...syms)
      let exported = exportsNeeded.get(id)
      if (!exported) {
        exportsNeeded.set(id, (exported = new Set()))
      }
      for (const s of syms) {
        exported.add(s)
      }
    }
  }

  // ---- imports already unused: in the shared module the env module imports --
  // (moved when the env module reads a shared name: its import of the shared
  // module is its first, so they run at the same point, once; a re-export
  // alone is printed last. Otherwise they stay in the env module)
  if (shared !== null) {
    const linked = imports.get('env')?.has(shared.id) === true
    for (const c of unusedImports) {
      included.get(linked ? 'env' : shared.id)!.delete(c)
      if (linked) {
        home.set(c, shared.id)
      }
    }
  }

  return {
    clusterOfRegion: graph.clusterOfRegion,
    clusterOfGen: graph.clusterOfGen,
    home,
    included,
    imports,
    exportsNeeded,
    fallbacks,
    shared,
    sharedExports,
  }
}
