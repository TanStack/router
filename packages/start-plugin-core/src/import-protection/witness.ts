/**
 * What a build's client bundle holds of its mocks (SPEC J6.4): the edge
 * modules in the bundler's own chunk lists, read after linking (Rolldown
 * `chunk.modules` with rendered code, Rspack's chunk graph with the inner
 * modules of a `ConcatenatedModule`), and the bundler's graph for traces. A
 * mock in a chunk is a violation; one in no chunk reports nothing. Whether a
 * mock stays is the bundler's: an edge mock owns pure exports (kept where a
 * binding survives), and an evaluated one (`EdgeModuleContent.evaluated`)
 * keeps a call, so it stays wherever its importer is evaluated.
 *
 * Structural types only: the readers take what Vite's `generateBundle` and
 * Rspack's `processAssets` hand the host.
 */
import { IMPORT_PROTECTION_PART, partOf } from '../rsbuild/module-record'
import type { EdgeModuleIds } from './edge-modules'
import type { GraphNode, NodeGraph } from './graph-trace'
import type { RspackImportProtectionBuildInfo } from './violations'

/** A host id or resource to the key of an environment's mock it is, or null. */
export type MockLookup = (idOrResource: string) => string | null

/** Builds the lookup of an environment's edge modules from the host's ids and the registry (`isMock`: the registry holds it as a mock). */
export function mockLookup(
  ids: EdgeModuleIds,
  env: string,
  isMock: (key: string) => boolean,
): MockLookup {
  return (id) => {
    const ref = ids.parse(id)
    return ref?.kind === 'edge' && ref.env === env && isMock(ref.key)
      ? ref.key
      : null
  }
}

// ---------------------------------------------------------------------------
// Vite / Rolldown
// ---------------------------------------------------------------------------

interface RolldownRenderedModule {
  renderedLength: number
}

interface RolldownOutputChunk {
  type: 'chunk'
  modules: Record<string, RolldownRenderedModule>
}

type RolldownOutputBundle = Record<
  string,
  RolldownOutputChunk | { type: 'asset' }
>

/** The keys of the mocks in a Rolldown build's chunks (`generateBundle`: `chunk.modules`, rendered code), sorted. */
export function rolldownMocksInChunks(
  bundle: RolldownOutputBundle,
  lookup: MockLookup,
): Array<string> {
  const live = new Set<string>()
  for (const out of Object.values(bundle)) {
    if (out.type !== 'chunk') {
      continue
    }
    for (const [id, m] of Object.entries(out.modules)) {
      const key = m.renderedLength > 0 ? lookup(id) : null
      if (key !== null) {
        live.add(key)
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
 * there (null). With the output's `bundle` (`generateBundle`), the modules
 * of its chunks (`kept`: Rolldown lists a module there when it is evaluated,
 * whatever of its code it kept).
 */
export function rolldownNodeGraph(
  env: string,
  getModuleInfo: (id: string) => RollupModuleInfoLike | null,
  bundle?: RolldownOutputBundle,
): NodeGraph {
  let kept: Set<string> | null = null
  return {
    ...(bundle && {
      kept(node) {
        if (!kept) {
          kept = new Set()
          for (const out of Object.values(bundle)) {
            if (out.type === 'chunk') {
              for (const id of Object.keys(out.modules)) {
                kept.add(id)
              }
            }
          }
        }
        return node.env === env && kept.has(node.id)
      },
    }),
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

type RspackChunkLike = object

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
    getIncomingConnections: (
      module: RspackModuleLike,
    ) => Iterable<RspackConnectionLike>
    /** The module a dependency belongs to (the inner module of a ConcatenatedModule). */
    getParentModule: (dependency: unknown) => RspackModuleLike | null
  }
  /** The child compilations (a worker plugin's), done during `make`. */
  children?: Iterable<RspackCompilationLike>
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
 * The keys of the mocks in an Rspack compilation's chunks (`processAssets`,
 * any stage: the chunk graph is final), the inner modules of a
 * `ConcatenatedModule` included, by compile environment (`envOf`;
 * `lookups`: each environment's), sorted. A file in two layers is a module
 * of each environment.
 */
export function rspackMocksInChunks(
  compilation: RspackCompilationLike,
  lookups: ReadonlyMap<string, MockLookup>,
  envOf: RspackEnvOf,
  idOf: (resource: string) => string = (resource) => resource,
): Map<string, Array<string>> {
  const live = new Map<string, Set<string>>()
  for (const chunk of lookups.size > 0 ? compilation.chunks : []) {
    for (const m of compilation.chunkGraph.getChunkModules(chunk)) {
      for (const inner of m.modules ?? [m]) {
        if (!inner.resource) {
          continue
        }
        const env = envOf(inner, m)
        const key = lookups.get(env)?.(idOf(inner.resource)) ?? null
        if (key !== null) {
          let keys = live.get(env)
          if (!keys) {
            keys = new Set()
            live.set(env, keys)
          }
          keys.add(key)
        }
      }
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
 * are final (`finishModules`), or between two rounds of builds at
 * `finishMake`; each answer is remembered.
 * `through`: narrows the walk for a reader that asks who really asks for a
 * module: `stop`, a module whose imports explain nothing (Start's own
 * server-function resolver imports every provider it lists: that import is
 * not a caller); `grounds`, modules that count as held (the providers
 * already admitted, whose imports are real).
 */
export function rspackHolds(
  compilation: {
    moduleGraph: {
      getIncomingConnections: (module: never) => Iterable<RspackConnectionLike>
    }
  },
  through?: {
    /** By `identifier()`. */
    stop?: ReadonlySet<string>
    grounds?: ReadonlySet<string>
    /**
     * Whether the build has RSC client references (default: it may).
     * Without RSC no connection is one, and reading a connection's
     * dependency to tell costs a call into the bundler per connection.
     */
    clientReferences?: boolean
  },
): (module: { identifier: () => string }) => boolean {
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
    // each module seen, with the module it was reached from (toward `start`)
    const from = new Map<string, string | null>([[startKey, null]])
    /** `key` is held, and so is every module between it and `start` (each imports the next). */
    const holds = (key: string): true => {
      for (let k: string | null | undefined = key; k != null; k = from.get(k)) {
        held.add(k)
      }
      return true
    }
    let queue: Array<[Module, string]> = [[start, startKey]]
    while (queue.length > 0) {
      const next: Array<[Module, string]> = []
      for (const [m, key] of queue) {
        for (const c of incoming(m)) {
          const origin = c.originModule as Module | null
          if (origin === null) {
            return holds(key)
          }
          const k = origin.identifier()
          if (held.has(k) || through?.grounds?.has(k)) {
            return holds(key)
          }
          // (asked last: it reads the connection's dependency)
          if (through?.clientReferences !== false && isClientReference(c)) {
            return holds(key)
          }
          if (through?.stop?.has(k)) {
            continue
          }
          if (!from.has(k) && !unheld.has(k)) {
            from.set(k, key)
            next.push([origin, k])
          }
        }
      }
      queue = next
    }
    // (every module seen reaches no entry either: its importers were seen)
    for (const k of from.keys()) {
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
  /** The nodes of the compilation's chunks (`kept`), by key, read on the first ask. */
  let keptNodes: Set<string> | null = null
  const keptIndex = (): Set<string> => {
    if (!keptNodes) {
      keptNodes = new Set()
      for (const chunk of compilation.chunks) {
        for (const m of compilation.chunkGraph.getChunkModules(chunk)) {
          for (const inner of m.modules ?? [m]) {
            if (inner.resource) {
              keptNodes.add(key(envOf(inner, m), idOf(inner.resource)))
            }
          }
        }
      }
    }
    return keptNodes
  }
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
    kept: (node) => keptIndex().has(key(node.env, node.id)),
    builds: (node) => (entryOf(node)?.own.length ?? 0) > 0,
    served(node) {
      for (const module of entryOf(node)?.own ?? []) {
        const record = partOf(module.buildInfo, IMPORT_PROTECTION_PART) as
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
