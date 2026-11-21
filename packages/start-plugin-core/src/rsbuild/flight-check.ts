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
 * chunks (`isClientReference`) with the client manifest Rspack reports for
 * each entry of the same compilation (`onManifest`): an entry is named when
 * its manifest lacks a reference its own graph reaches; it runs only in a
 * compilation whose last run built something (the graph can gain a module
 * after the handoff only there), and in builds only (decision E1).
 */
import path from 'node:path'
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

/** What Start reads of Rspack's RSC manifest (`RscServerPluginOptions.onManifest`): each entry's client manifest, keyed by module resource. */
export type RscManifestLike = Record<
  string,
  { clientManifest: Record<string, unknown> }
>

/** A client reference the `rsc` environment's chunks hold, with a used export. */
export interface FlightReference {
  resource: string
  /** Its used exports (`true`: all or unknown). */
  exports: ReadonlyArray<string> | true
  /** Its module (`reaches`). */
  module: RspackModuleLike
}

/** What `isClientReference` reads of a module. */
interface ProxyModuleLike extends RspackModuleLike {
  dependencies?: Iterable<{ request?: string; ids?: ReadonlyArray<string> }>
  originalSource?: () => { source: () => string | Buffer } | null
}

/** A chunk group of an Rspack compilation (an entrypoint, an `import()`'s). */
interface ChunkGroupLike {
  childrenIterable: Iterable<ChunkGroupLike>
  /** A number for a module the group's own graph reaches (its blocks'), else none. */
  getModulePreOrderIndex: (
    module: RspackModuleLike,
  ) => number | null | undefined
}

/** What `undeliveredReferences` reads of a compilation: its entries. */
interface EntriesLike {
  entrypoints: ReadonlyMap<string, ChunkGroupLike>
}

/**
 * The id argument of a proxy's registration, a string literal:
 * `registerClientReference(function () { throw … }, "<id>", "<export>")`.
 */
const registration =
  /\}\s*,\s*("(?:[^"\\\r\n]|\\.)*")\s*,\s*"(?:[^"\\\r\n]|\\.)*"\s*\)/g

/**
 * Whether Rspack compiled a module of the `rsc` layer as a client reference:
 * its RSC transform (SWC `reactServerComponents`, in `builtin:swc-loader`)
 * replaces a client module, whatever made it one (its own directive, a
 * package's entry, a loader), by proxies registered with
 * `registerClientReference` of `react-server-dom-rspack/server` under the
 * module's own resource, a string literal; the ServerPlugin's own mark of
 * it (`buildInfo.rsc`) stays native. A server module of the app that
 * imports the function to register what its callers name (an adapter) is
 * none, nor a module of another type (an asset of the file: `new
 * URL('./Inner.tsx', import.meta.url)`, which has no import). The source is
 * read only of a module that imports the function. (Relies on the
 * transform's output: Rspack 2.x.)
 */
function isClientReference(module: ProxyModuleLike, resource: string): boolean {
  let imports = false
  for (const dependency of module.dependencies ?? []) {
    if (
      dependency.request === 'react-server-dom-rspack/server' &&
      dependency.ids?.includes('registerClientReference')
    ) {
      imports = true
      break
    }
  }
  if (!imports) {
    return false
  }
  const source = String(module.originalSource?.()?.source() ?? '')
  for (const [, id] of source.matchAll(registration)) {
    try {
      if (JSON.parse(id!) === resource) {
        return true
      }
    } catch {
      // (an escape JSON does not have: not a resource Rspack wrote)
    }
  }
  return false
}

/**
 * The live client references of an RSC server compilation's `rsc`
 * environment: its chunks' modules Rspack compiled as client references
 * (`isClientReference`) that have a used export.
 */
export function liveClientReferences(
  compilation: RspackCompilationLike,
  isRscModule: (module: RspackModuleLike, holder: RspackModuleLike) => boolean,
): Array<FlightReference> {
  const candidates = new Map<string, RspackModuleLike>()
  forEachChunkModule(compilation, (module, holder) => {
    const resource = module.resource
    if (
      resource &&
      !candidates.has(resource) &&
      isRscModule(module, holder) &&
      isClientReference(module, resource)
    ) {
      candidates.set(resource, module)
    }
  })
  const runtimes = runtimesOf(compilation)
  const out: Array<FlightReference> = []
  for (const [resource, module] of candidates) {
    const used = usedExportsOf(compilation, module, runtimes)
    if (mayUseExports(used)) {
      out.push({
        resource,
        exports: Array.isArray(used) ? [...used].sort() : true,
        module,
      })
    }
  }
  return out.sort((a, b) =>
    a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0,
  )
}

/**
 * The references (`liveClientReferences`) an entry's client manifest lacks
 * although the entry's graph reaches them (`reaches`), each with those
 * entries. Rspack's manifest of an entry holds the references of the
 * entry's own graph: an entry's module of a chunk it shares with another
 * entry (a vendor chunk) is no reference of the other's. The graph is read
 * only for a reference a manifest lacks.
 */
export function undeliveredReferences(
  compilation: EntriesLike,
  required: ReadonlyArray<FlightReference>,
  manifest: RscManifestLike,
): Array<{ reference: FlightReference; entries: Array<string> }> {
  const entries = Object.keys(manifest).sort()
  /** Each entry's chunk groups: its entrypoint and the groups it loads. */
  const groups = new Map<string, Array<ChunkGroupLike>>()
  const reaches = (entry: string, module: RspackModuleLike) => {
    let own = groups.get(entry)
    if (!own) {
      const entrypoint = compilation.entrypoints.get(entry)
      const found = new Set(entrypoint ? [entrypoint] : [])
      for (const group of found) {
        for (const child of group.childrenIterable) {
          found.add(child)
        }
      }
      own = [...found]
      groups.set(entry, own)
    }
    return own.some(
      (group) => typeof group.getModulePreOrderIndex(module) === 'number',
    )
  }
  const out: Array<{ reference: FlightReference; entries: Array<string> }> = []
  for (const reference of required) {
    const lacking = entries.filter(
      (entry) =>
        !Object.hasOwn(manifest[entry]!.clientManifest, reference.resource) &&
        reaches(entry, reference.module),
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
  const file = path.relative(root, missing.reference.resource)
  const exports =
    missing.reference.exports === true
      ? ''
      : ` (${missing.reference.exports.join(', ')})`
  return [
    `[tanstack-start] The client component ${file}${exports} is a client reference of the RSC build, and the Flight client manifest Rspack delivered (entry ${missing.entries.join(', ')}) has no entry of it: the browser cannot show a server function result that renders it. This happens when server code the RSC build reaches only after it handed the client build its client components renders it (a server function only client code calls, whose handler renders it).`,
    `  Render ${file} from server code the build reaches before the client: a server component of a route, or a server function a route's loader calls.`,
  ].join('\n')
}
