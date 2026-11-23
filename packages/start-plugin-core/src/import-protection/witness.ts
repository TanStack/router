/**
 * Survival witness readers: which edge modules survived tree-shaking, read from
 * the bundler after linking, and the bundler's graph for traces. An edge module
 * survives when it owns a used export (`renderedExports` on Rolldown, used
 * exports on Rspack) or, when its target is effectful, when it is in a chunk at
 * all (the `__fx` effect witness is kept iff its importer is evaluated).
 *
 * Structural types only: the readers take what Vite's `generateBundle` and
 * Rspack's `processAssets` hand the host.
 */
import { RSPACK_BUILD_INFO_KEY } from './violations'
import type { EdgeModuleIds } from './edge-modules'
import type { GraphNode, NodeGraph } from './graph-trace'
import type { RspackImportProtectionBuildInfo } from './violations'

/** An edge module as the readers see it: its key and whether its target is effectful. */
interface WitnessModule {
  key: string
  effectful: boolean
}

export type WitnessLookup = (idOrResource: string) => WitnessModule | null

/** Builds the lookup of an environment's edge modules from the host's ids and the registry. */
export function witnessLookup(
  ids: EdgeModuleIds,
  env: string,
  effectfulOf: (key: string) => boolean | null,
): WitnessLookup {
  return (id) => {
    const ref = ids.parse(id)
    if (!ref || ref.kind !== 'edge' || ref.env !== env) {
      return null
    }
    const effectful = effectfulOf(ref.key)
    return effectful === null ? null : { key: ref.key, effectful }
  }
}

// ---------------------------------------------------------------------------
// Vite / Rolldown
// ---------------------------------------------------------------------------

interface RolldownRenderedModule {
  renderedExports: ReadonlyArray<string>
}

interface RolldownOutputChunk {
  type: 'chunk'
  modules: Record<string, RolldownRenderedModule>
}

type RolldownOutputBundle = Record<
  string,
  RolldownOutputChunk | { type: 'asset' }
>

/** The keys of the edge modules that survived a Rolldown build (`generateBundle`), sorted. */
export function readRolldownWitness(
  bundle: RolldownOutputBundle,
  lookup: WitnessLookup,
): Array<string> {
  const live = new Set<string>()
  for (const out of Object.values(bundle)) {
    if (out.type !== 'chunk') {
      continue
    }
    for (const [id, m] of Object.entries(out.modules)) {
      const edge = lookup(id)
      if (edge && (m.renderedExports.length > 0 || edge.effectful)) {
        live.add(edge.key)
      }
    }
  }
  return [...live].sort()
}

interface RollupModuleInfoLike {
  importers: ReadonlyArray<string>
  dynamicImporters: ReadonlyArray<string>
  isEntry: boolean
}

/**
 * The module graph of the Rolldown build of environment `env`
 * (`this.getModuleInfo`): another environment's nodes are not readable
 * there (null).
 */
export function rolldownNodeGraph(
  env: string,
  getModuleInfo: (id: string) => RollupModuleInfoLike | null,
): NodeGraph {
  return {
    importers(node) {
      if (node.env !== env) {
        return null
      }
      const info = getModuleInfo(node.id)
      return info
        ? [...info.importers, ...info.dynamicImporters].map((id) => ({
            env,
            id,
          }))
        : []
    },
    isEntry: (node) =>
      node.env === env && getModuleInfo(node.id)?.isEntry === true,
  }
}

// ---------------------------------------------------------------------------
// Rspack
// ---------------------------------------------------------------------------

export interface RspackModuleLike {
  resource?: string
  buildInfo?: Record<string, unknown>
  /** Inner modules of a ConcatenatedModule. */
  modules?: Iterable<RspackModuleLike>
  /** The module a ConcatenatedModule stands in for (it has no `resource` of its own). */
  rootModule?: RspackModuleLike
}

interface RspackChunkLike {
  runtime?: Iterable<string> | string
}

/**
 * Whether a connection is Rspack's RSC client reference: the module that
 * lists a server component's `'use client'` imports for the client (no file
 * of its own) imports each of them through one. A component it holds is in
 * the app as an entry's module is: the server component that renders it
 * is. Other file-less holders (a container's exposes, a shared provide)
 * stay outside the app on purpose (design-rsc-phase1-settlement.md,
 * amendment 3): the dependency's type tells them apart, not their shape.
 */
function isClientReference(c: RspackConnectionLike): boolean {
  return (
    (c.dependency as { type?: unknown } | undefined)?.type ===
    'rsc client reference'
  )
}

interface RspackConnectionLike {
  originModule: RspackModuleLike | null
  /** The imported module as resolved (an inner module, when the connection moved to its ConcatenatedModule). */
  resolvedModule?: RspackModuleLike | null
  dependency?: unknown
}

interface RspackCompilationLike {
  chunks: Iterable<RspackChunkLike>
  modules: Iterable<RspackModuleLike>
  chunkGraph: {
    getChunkModules: (chunk: RspackChunkLike) => Iterable<RspackModuleLike>
  }
  moduleGraph: {
    getUsedExports: (
      module: RspackModuleLike,
      runtime: Array<string> | string | undefined,
    ) => ReadonlyArray<string> | boolean | null
    getIncomingConnections: (
      module: RspackModuleLike,
    ) => Iterable<RspackConnectionLike>
    /** The module a dependency belongs to (the inner module of a ConcatenatedModule). */
    getParentModule: (dependency: unknown) => RspackModuleLike | null
  }
  /** The child compilations (a worker plugin's), done during `make`. */
  children?: Iterable<RspackCompilationLike>
}

function runtimesOf(compilation: RspackCompilationLike): Array<string> {
  const out = new Set<string>()
  for (const chunk of compilation.chunks) {
    const r = chunk.runtime
    if (typeof r === 'string') {
      out.add(r)
    } else if (r) {
      for (const name of r) {
        out.add(name)
      }
    }
  }
  return [...out]
}

/**
 * The compile environment of a module of an Rspack compilation, from the
 * host (`holder`: the ConcatenatedModule of an inner module, else the
 * module): an edge module's is the one its id names, any other module's
 * that of its layer.
 */
export type RspackEnvOf = (
  module: RspackModuleLike,
  holder: RspackModuleLike,
) => string

/**
 * The keys of the edge modules that survived an Rspack compilation
 * (`processAssets`, any stage: graph readings do not depend on it), by
 * compile environment (`envOf`; `lookups`: each environment's), sorted. Only modules in a chunk can survive (concatenated
 * inner modules included); a used export or an effectful target makes it
 * live; `null` used exports (usedExports off) leave it to inclusion. A file
 * in two layers is a module of each environment.
 */
export function readRspackWitness(
  compilation: RspackCompilationLike,
  lookups: ReadonlyMap<string, WitnessLookup>,
  envOf: RspackEnvOf,
  idOf: (resource: string) => string = (resource) => resource,
): Map<string, Array<string>> {
  const inChunk = new Map<
    string,
    { env: string; module: RspackModuleLike; edge: WitnessModule }
  >()
  for (const chunk of compilation.chunks) {
    for (const m of compilation.chunkGraph.getChunkModules(chunk)) {
      for (const inner of m.modules ?? [m]) {
        const res = inner.resource
        if (!res) {
          continue
        }
        const env = envOf(inner, m)
        const key = `${env}\0${res}`
        const lookup = lookups.get(env)
        if (!lookup || inChunk.has(key)) {
          continue
        }
        const edge = lookup(idOf(res))
        if (edge) {
          inChunk.set(key, { env, module: inner, edge })
        }
      }
    }
  }
  const runtimes = runtimesOf(compilation)
  const live = new Map<string, Set<string>>()
  for (const { env, module, edge } of inChunk.values()) {
    const used = compilation.moduleGraph.getUsedExports(module, runtimes)
    if (
      used === true ||
      used === null ||
      (Array.isArray(used) && used.length > 0) ||
      edge.effectful
    ) {
      let keys = live.get(env)
      if (!keys) {
        keys = new Set()
        live.set(env, keys)
      }
      keys.add(edge.key)
    }
  }
  const out = new Map<string, Array<string>>()
  for (const env of lookups.keys()) {
    out.set(env, [...(live.get(env) ?? [])].sort())
  }
  return out
}

/**
 * Whether an Rspack compilation holds a module for its output, for its
 * diagnostics: a connection from no module (an entry, an include) arrives
 * at it, or at a module importing it, through any module, one of no file
 * included (a Module Federation container entry, a context module). A
 * module that a rebuild at `finishMake` left unreachable (a server fn's
 * handler module once the resolver drops the function) stays in the
 * compilation, and in the persistent cache: it is not held. Not the
 * graph's `isEntry` and `importers`, which a module of no file does not
 * ground (import protection's grants). Read once the compilation's modules
 * are final (`finishModules`); each answer is remembered.
 */
export function rspackHolds(compilation: {
  moduleGraph: {
    getIncomingConnections: (module: never) => Iterable<RspackConnectionLike>
  }
}): (module: { identifier: () => string }) => boolean {
  type Module = { identifier: () => string }
  const incoming = (m: Module) =>
    compilation.moduleGraph.getIncomingConnections(m as never)
  const held = new Set<string>()
  const unheld = new Set<string>()
  return (start) => {
    const startKey = start.identifier()
    if (held.has(startKey)) {
      return true
    }
    if (unheld.has(startKey)) {
      return false
    }
    const seen = new Set([startKey])
    let queue: Array<Module> = [start]
    while (queue.length > 0) {
      const next: Array<Module> = []
      for (const m of queue) {
        for (const c of incoming(m)) {
          const origin = c.originModule as Module | null
          if (origin === null || isClientReference(c)) {
            held.add(startKey)
            return true
          }
          const k = origin.identifier()
          if (held.has(k)) {
            held.add(startKey)
            return true
          }
          if (!seen.has(k) && !unheld.has(k)) {
            seen.add(k)
            next.push(origin)
          }
        }
      }
      queue = next
    }
    // (every module seen reaches no entry either: its importers were seen)
    for (const k of seen) {
      unheld.add(k)
    }
    return false
  }
}

/** An Rspack compilation's graph (`rspackNodeGraph`). */
export interface RspackNodeGraph extends NodeGraph {
  /** Whether `node` is a module of the compilation or of one of its child compilations (what `hold` keeps). */
  holds: (node: GraphNode) => boolean
  /** Whether `node` is a module of the compilation itself: one it can build again (the settlement decides it). */
  builds: (node: GraphNode) => boolean
  /**
   * What the compilation's own module of `node` was built as, by its
   * import-protection record (`RspackImportProtectionBuildInfo.served`):
   * another compilation's module of the file (a child's, the parent's) may
   * have been built otherwise. Null: no record says it (a module whose
   * compile failed).
   */
  served: (node: GraphNode) => 'mock' | 'real' | null
}

/**
 * The module graph of an Rspack compilation and of its child compilations
 * (a worker plugin's, done during `make`: their modules are compiled as
 * this compiler's), of all their compile environments (`envOf`), by
 * canonical resource (`idOf`): a node's importers are the origins of the
 * connections into its modules (a file in two layers is a module of each;
 * a file in the compilation and in a child is one node, its importers
 * those of both), each a node of its own environment. A node is an entry
 * when the compilation holds it by itself: a connection with no origin
 * module arrives at one of its own modules (config and named entries, an
 * unnamed `EntryPlugin`, `addInclude` with or without an entry, a child
 * compilation's entry, in that compilation's graph); entry data lists no
 * global include. Its index is built on its first
 * read: a compilation with no denied module reads nothing. Readable once
 * the compilation's modules are built (`finishMake`, later hooks); a step
 * that builds modules again needs a new one.
 */
export function rspackNodeGraph(
  compilation: RspackCompilationLike,
  idOf: (resource: string) => string,
  envOf: RspackEnvOf,
): RspackNodeGraph {
  /** A module holding a node's connections, with the graph of its compilation. */
  interface Held {
    module: RspackModuleLike
    moduleGraph: RspackCompilationLike['moduleGraph']
  }
  const compilations = (): Array<RspackCompilationLike> => {
    const out = [compilation]
    for (const c of out) {
      out.push(...(c.children ?? []))
    }
    return out
  }
  /**
   * A node's modules holding its connections, whether one is a module of
   * the compilation itself, and whether the compilation holds it by itself
   * (read once, on the first `isEntry`).
   */
  interface Entry {
    held: Array<Held>
    /** The node's modules of the compilation itself (`builds`, `served`). */
    own: Array<RspackModuleLike>
    byItself?: boolean
  }
  // a production module can also be an inner module of a ConcatenatedModule (scope hoisting),
  // which holds the connections from outside the concatenation
  /**
   * The nodes, by environment and id: no key string per module (every
   * later compilation's `hold` builds the index, of every module).
   */
  let byEnv: Map<string, Map<string, Entry>> | null = null
  /** The environment of each concatenated inner module of the index (from its holder). */
  const envs = new Map<RspackModuleLike, string>()
  const key = (env: string, id: string) => `${env}\0${id}`
  const entryOf = (node: GraphNode): Entry | undefined => {
    if (!byEnv) {
      byEnv = new Map()
      for (const c of compilations()) {
        for (const m of c.modules) {
          for (const inner of [m, ...(m.modules ?? [])]) {
            if (!inner.resource) {
              continue
            }
            const env = envOf(inner, m)
            if (inner !== m) {
              envs.set(inner, env)
            }
            const id = idOf(inner.resource)
            let ids = byEnv.get(env)
            if (!ids) {
              ids = new Map()
              byEnv.set(env, ids)
            }
            let entry = ids.get(id)
            if (!entry) {
              entry = { held: [], own: [] }
              ids.set(id, entry)
            }
            if (c === compilation) {
              entry.own.push(inner)
            }
            for (const holder of inner === m ? [m] : [inner, m]) {
              if (!entry.held.some((h) => h.module === holder)) {
                entry.held.push({ module: holder, moduleGraph: c.moduleGraph })
              }
            }
          }
        }
      }
    }
    return byEnv.get(node.env)?.get(node.id)
  }
  /**
   * Whether `c`, a connection into a module holding `node`'s connections,
   * arrives at `node`: a ConcatenatedModule holds the connections of each
   * of its inner modules.
   */
  const arrives = (c: RspackConnectionLike, node: GraphNode) => {
    const target = c.resolvedModule
    return (
      target?.resource === undefined ||
      (idOf(target.resource) === node.id &&
        (envs.get(target) ?? envOf(target, target)) === node.env)
    )
  }
  /** The module `c` comes from: the importing module itself, inside a ConcatenatedModule origin. */
  const originOf = (
    c: RspackConnectionLike,
    moduleGraph: Held['moduleGraph'],
  ) =>
    (c.dependency !== undefined
      ? moduleGraph.getParentModule(c.dependency)
      : null) ?? c.originModule
  return {
    importers(node) {
      const out: Array<GraphNode> = []
      const seen = new Set<string>([key(node.env, node.id)])
      const visit = (
        m: RspackModuleLike,
        moduleGraph: Held['moduleGraph'],
        viaContext: boolean,
      ) => {
        for (const c of moduleGraph.getIncomingConnections(m)) {
          if (!arrives(c, node)) {
            continue
          }
          const origin = originOf(c, moduleGraph)
          if (origin?.resource) {
            const from = {
              env: envs.get(origin) ?? envOf(origin, c.originModule ?? origin),
              id: idOf(origin.resource),
            }
            const k = key(from.env, from.id)
            if (!seen.has(k)) {
              seen.add(k)
              out.push(from)
            }
          } else if (origin && !viaContext) {
            // a context module (`import.meta.webpackContext`, a template
            // literal `import()`): the modules importing it import `node`
            visit(origin, moduleGraph, true)
          }
        }
      }
      for (const { module, moduleGraph } of entryOf(node)?.held ?? []) {
        visit(module, moduleGraph, false)
      }
      return out
    },
    imported(node) {
      return (entryOf(node)?.held ?? []).some(({ module, moduleGraph }) => {
        for (const c of moduleGraph.getIncomingConnections(module)) {
          if (arrives(c, node) && originOf(c, moduleGraph)) {
            return true
          }
        }
        return false
      })
    },
    isEntry(node) {
      const entry = entryOf(node)
      if (!entry) {
        return false
      }
      entry.byItself ??= entry.held.some(({ module, moduleGraph }) => {
        // a production entry is usually a ConcatenatedModule (scope
        // hoisting): its connection from no module is its root module's
        const target = module.resource ? module : module.rootModule
        if (
          !target?.resource ||
          idOf(target.resource) !== node.id ||
          (envs.get(target) ?? envOf(target, module)) !== node.env
        ) {
          return false
        }
        for (const c of moduleGraph.getIncomingConnections(module)) {
          if (c.originModule === null || isClientReference(c)) {
            return true
          }
        }
        return false
      })
      return entry.byItself
    },
    holds: (node) => entryOf(node) !== undefined,
    builds: (node) => (entryOf(node)?.own.length ?? 0) > 0,
    served(node) {
      for (const module of entryOf(node)?.own ?? []) {
        const record = module.buildInfo?.[RSPACK_BUILD_INFO_KEY] as
          | RspackImportProtectionBuildInfo
          | undefined
        if (record?.served) {
          return record.served
        }
      }
      return null
    },
  }
}
