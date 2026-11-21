/**
 * The Flight completion check of an Rsbuild RSC production build (RSC
 * decision 4 and phase 3b, design-rsc-phase2.md §5.1). Rspack's RSC
 * ServerPlugin hands the client compilation the client references of the
 * `rsc` graph once (server `finishMake` stage 0). A module the server
 * compilation builds later (its last settlement run: a server fn only
 * client code calls) can bring a client component no reference was handed
 * for: the Flight client manifest Rspack delivers has no entry of it, and
 * the browser cannot decode a server fn result that renders it. The check
 * compares the client references Rspack compiled in the `rsc` environment's
 * chunks (`clientReferenceId`) with the client manifest Rspack reports for
 * each entry of the same compilation (`onManifest`): an entry is named when
 * its manifest lacks a reference its own graph reaches (what the entry's
 * runtime can load); it runs only in a compilation whose last run built
 * something (the graph can gain a module after the handoff only there), and
 * in builds only (decision E1).
 */
import path from 'node:path'
import { parseModule } from '@tanstack/router-utils/compiler'
import {
  forEachChunkModule,
  mayUseExports,
  runtimesOf,
  usedExportsOf,
} from '../import-protection/witness'
import type {
  RspackCompilationLike,
  RspackModuleLike,
} from '../import-protection/witness'

/** What Start reads of Rspack's RSC manifest (`RscServerPluginOptions.onManifest`): each entry's client manifest, keyed by Flight id. */
export type RscManifestLike = Record<
  string,
  { clientManifest: Record<string, unknown> }
>

/** A client reference the `rsc` environment's chunks hold, with a used export. */
export interface FlightReference {
  /** Its Flight id, the key of a client manifest (`flightIdOf`). */
  id: string
  /** Its used exports (`true`: all or unknown). */
  exports: ReadonlyArray<string> | true
  /** Its modules with a used export: one per resource of the id (`./X.tsx#a`, `./X.tsx#b`). */
  modules: Array<RspackModuleLike>
}

/** What `clientReferenceId` reads of a module. */
interface ProxyModuleLike extends RspackModuleLike {
  dependencies?: Iterable<{ request?: string; ids?: ReadonlyArray<string> }>
  resourceResolveData?: { path?: string; query?: string }
  originalSource?: () => { source: () => string | Buffer } | null
}

/** An `import()`'s (or a worker's) block of a module. */
interface BlockLike {
  dependencies: Iterable<unknown>
  blocks: Iterable<BlockLike>
}

/** What `undeliveredReferences` walks of a module. */
interface GraphModuleLike extends RspackModuleLike {
  dependencies?: Iterable<unknown>
  blocks?: Iterable<BlockLike>
}

/** What `undeliveredReferences` reads of a compilation: its entries and graphs. */
interface EntriesLike {
  entries: ReadonlyMap<string, { dependencies: Iterable<unknown> }>
  entrypoints: ReadonlyMap<
    string,
    { getEntrypointChunk: () => { runtime: Iterable<string> } }
  >
  moduleGraph: {
    getModule: (dependency: unknown) => GraphModuleLike | null
    getConnection: (dependency: unknown) => {
      module: GraphModuleLike | null
      resolvedModule: GraphModuleLike | null
      /** `false` for a connection the runtime does not need (an unused re-export of a side-effect-free barrel). */
      getActiveState: (runtime: Array<string>) => unknown
    } | null
  }
  chunkGraph: {
    getBlockChunkGroup: (
      block: BlockLike,
    ) => { chunks: Iterable<{ hasRuntime: () => boolean }> } | null
  }
}

const REGISTRAR = 'react-server-dom-rspack/server'

/**
 * The id Rspack registers a client reference of a module under and keys
 * the client manifest by: the module's resolved path and query, without
 * its fragment (`get_module_resource` of rspack_plugin_rsc; its swc-loader
 * gives the transform the same), `null` for a module with no resolved
 * path.
 */
function flightIdOf(module: ProxyModuleLike): string | null {
  const data = module.resourceResolveData
  return data?.path === undefined ? null : data.path + (data.query ?? '')
}

/**
 * The Flight id of a module of the `rsc` layer Rspack compiled as a client
 * reference, else `null`. Its RSC transform (SWC `reactServerComponents`,
 * in `builtin:swc-loader`) replaces a client module, whatever made it one
 * (its own directive, a package's entry, a loader), by proxies: calls of
 * `registerClientReference`, imported from `react-server-dom-rspack/server`,
 * with the module's Flight id (`flightIdOf`) as their second argument, a
 * string literal; the ServerPlugin's own mark of it (`buildInfo.rsc`) stays
 * native. The module's source after its loaders is parsed, only for a
 * module that imports the function: a call of the imported binding
 * registering the module's own id makes it one. A server module of the app
 * registering what its callers name, or another file (an adapter), is none,
 * whatever its other calls pass; nor is a module of another type (an asset
 * of the file: `new URL('./Inner.tsx', import.meta.url)`, which has no
 * import). (Relies on the transform's output: Rspack 2.x.)
 */
function clientReferenceId(module: ProxyModuleLike): string | null {
  let imports = false
  for (const dependency of module.dependencies ?? []) {
    if (
      dependency.request === REGISTRAR &&
      dependency.ids?.includes('registerClientReference')
    ) {
      imports = true
      break
    }
  }
  const id = imports ? flightIdOf(module) : null
  if (id === null) {
    return null
  }
  const parsed = parseModule(
    String(module.originalSource?.()?.source() ?? ''),
    { lang: 'js', sourceType: 'module' },
  )
  if (!parsed.ok) {
    return null
  }
  for (const record of parsed.file.imports) {
    if (
      record.kind !== 'named' ||
      record.typeOnly ||
      record.specifier !== REGISTRAR ||
      record.name !== 'registerClientReference'
    ) {
      continue
    }
    for (const use of record.local?.references ?? []) {
      if (use.inTypePosition || use.isWrite) {
        continue
      }
      const call = parsed.file.parentOf(use.node)
      if (call?.type !== 'CallExpression' || call.callee !== use.node) {
        continue
      }
      const registered = call.arguments[1]
      if (registered?.type === 'Literal' && registered.value === id) {
        return id
      }
    }
  }
  return null
}

/**
 * The live client references of an RSC server compilation's `rsc`
 * environment: its chunks' modules Rspack compiled as client references
 * (`clientReferenceId`) that have a used export, by Flight id.
 */
export function liveClientReferences(
  compilation: RspackCompilationLike,
  isRscModule: (module: RspackModuleLike, holder: RspackModuleLike) => boolean,
): Array<FlightReference> {
  const checked = new Set<RspackModuleLike>()
  const candidates = new Map<string, Array<RspackModuleLike>>()
  forEachChunkModule(compilation, (module, holder) => {
    if (
      checked.has(module) ||
      !module.resource ||
      !isRscModule(module, holder)
    ) {
      return
    }
    checked.add(module)
    const id = clientReferenceId(module)
    if (id !== null) {
      const modules = candidates.get(id)
      if (modules) {
        modules.push(module)
      } else {
        candidates.set(id, [module])
      }
    }
  })
  const runtimes = runtimesOf(compilation)
  const out: Array<FlightReference> = []
  for (const [id, modules] of candidates) {
    const live: Array<RspackModuleLike> = []
    let names: Set<string> | true = new Set()
    for (const module of modules) {
      const used = usedExportsOf(compilation, module, runtimes)
      if (!mayUseExports(used)) {
        continue
      }
      live.push(module)
      if (!Array.isArray(used)) {
        names = true
      } else if (names !== true) {
        for (const name of used) {
          names.add(name)
        }
      }
    }
    if (live.length > 0) {
      out.push({
        id,
        exports: names === true ? true : [...names].sort(),
        modules: live,
      })
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * The references (`liveClientReferences`) an entry's client manifest lacks
 * although the entry's graph reaches them, each with those entries. What an
 * entry reaches (`reachedBy`) is what its runtime can load: the modules the
 * walk from the entry's dependencies finds over the finished graph, through
 * the connections active in the entry's runtime (not an unused re-export of
 * a side-effect-free barrel another entry uses), into the blocks whose chunk
 * group the entry loads (an `import()`'s; not a worker's, whose group runs a
 * runtime of its own, nor a block in no group), a ConcatenatedModule through
 * its inner modules. So a module of a chunk or chunk group the entry shares
 * with another entry (a vendor chunk, an `import()` chunk name both use) is
 * no reference of the entry unless its own graph imports it. (Rspack's
 * plugin finds an entry's client components walking every connection from
 * the entry's dependencies at its handoff,
 * `collect_component_info_from_entry_dependencies`: its manifest holds at
 * least what the entry's runtime loads of the graph it had.) The graph is
 * walked only for a reference a manifest lacks, once per entry.
 */
export function undeliveredReferences(
  compilation: EntriesLike,
  required: ReadonlyArray<FlightReference>,
  manifest: RscManifestLike,
): Array<{ reference: FlightReference; entries: Array<string> }> {
  const entries = Object.keys(manifest).sort()
  const { moduleGraph, chunkGraph } = compilation
  /** Each entry's modules: what its runtime can load. */
  const reached = new Map<string, Set<RspackModuleLike>>()
  const reachedBy = (entry: string) => {
    const own = new Set<RspackModuleLike>()
    const entrypoint = compilation.entrypoints.get(entry)
    if (!entrypoint) {
      return own
    }
    const runtime = [...entrypoint.getEntrypointChunk().runtime]
    const stack: Array<GraphModuleLike> = []
    const add = (module: GraphModuleLike | null) => {
      if (module && !own.has(module)) {
        own.add(module)
        stack.push(module)
      }
    }
    const follow = (dependency: unknown) => {
      const connection = moduleGraph.getConnection(dependency)
      if (connection && connection.getActiveState(runtime) !== false) {
        add(connection.module)
        add(connection.resolvedModule)
      }
    }
    const enter = (block: BlockLike) => {
      const group = chunkGraph.getBlockChunkGroup(block)
      if (!group || [...group.chunks].some((chunk) => chunk.hasRuntime())) {
        return
      }
      for (const dependency of block.dependencies) {
        follow(dependency)
      }
      for (const nested of block.blocks) {
        enter(nested)
      }
    }
    for (const dependency of compilation.entries.get(entry)?.dependencies ??
      []) {
      add(moduleGraph.getModule(dependency))
    }
    for (let module = stack.pop(); module; module = stack.pop()) {
      if (module.modules) {
        for (const inner of module.modules) {
          add(inner)
        }
        continue
      }
      for (const dependency of module.dependencies ?? []) {
        follow(dependency)
      }
      for (const block of module.blocks ?? []) {
        enter(block)
      }
    }
    return own
  }
  const reaches = (entry: string, modules: Array<RspackModuleLike>) => {
    let own = reached.get(entry)
    if (!own) {
      own = reachedBy(entry)
      reached.set(entry, own)
    }
    return modules.some((module) => own.has(module))
  }
  const out: Array<{ reference: FlightReference; entries: Array<string> }> = []
  for (const reference of required) {
    const lacking = entries.filter(
      (entry) =>
        !Object.hasOwn(manifest[entry]!.clientManifest, reference.id) &&
        reaches(entry, reference.modules),
    )
    if (lacking.length > 0) {
      out.push({ reference, entries: lacking })
    }
  }
  return out
}

/** The warning of a client reference the delivered Flight manifest lacks. */
export function undeliveredWarning(
  missing: { reference: FlightReference; entries: Array<string> },
  root: string,
): string {
  const file = path.relative(root, missing.reference.id)
  const exports =
    missing.reference.exports === true
      ? ''
      : ` (${missing.reference.exports.join(', ')})`
  return [
    `[tanstack-start] The client component ${file}${exports} is a client reference of the RSC build, and the Flight client manifest Rspack delivered (entry ${missing.entries.join(', ')}) has no entry of it: the browser cannot show a server function result that renders it. This happens when server code the RSC build reaches only after it handed the client build its client components renders it (a server function only client code calls, whose handler renders it).`,
    `  Render ${file} from server code the build reaches before the client: a server component of a route, or a server function a route's loader calls.`,
  ].join('\n')
}
