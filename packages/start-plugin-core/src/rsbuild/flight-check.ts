/**
 * The Flight completion check of an Rsbuild RSC production build (RSC
 * decision 4 and phase 3b, design-rsc-phase2.md §5.1). Rspack's RSC
 * ServerPlugin hands the client compilation the client references of the
 * `rsc` graph once (server `finishMake` stage 0). A module the server
 * compilation builds later (its last settlement run: a server fn only
 * client code calls) can bring a client component no reference was handed
 * for: the Flight client manifest Rspack delivers has no entry of it, and
 * the browser cannot decode a server fn result that renders it. The check
 * compares the client references Rspack compiled in the `rsc`
 * environment's chunks (`isClientReference`) with the per-entry client
 * manifests Rspack reports for the same compilation (`onManifest`); it runs
 * only in a compilation whose last run built something (the graph can gain
 * a module after the handoff only there), and in builds only (decision E1).
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
}

/** What `isClientReference` reads of a module's dependencies. */
interface DependencyLike {
  request?: string
  ids?: ReadonlyArray<string>
}

/**
 * Whether Rspack compiled a module of the `rsc` layer as a client reference:
 * its RSC transform (SWC `reactServerComponents`) replaces a client module,
 * whatever made it one (its own directive, a package's entry, a loader), by
 * proxies registered with `registerClientReference` of
 * `react-server-dom-rspack/server`; the ServerPlugin's own mark of it
 * (`buildInfo.rsc`) stays native. A module of another type (an asset of the
 * file: `new URL('./Inner.tsx', import.meta.url)`) has no such import.
 * (Relies on the transform's output: Rspack 2.x.)
 */
function isClientReference(module: RspackModuleLike): boolean {
  const dependencies = (module as { dependencies?: Iterable<DependencyLike> })
    .dependencies
  for (const dependency of dependencies ?? []) {
    if (
      dependency.request === 'react-server-dom-rspack/server' &&
      dependency.ids?.includes('registerClientReference')
    ) {
      return true
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
      isClientReference(module)
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
      })
    }
  }
  return out.sort((a, b) =>
    a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0,
  )
}

/**
 * The references (`liveClientReferences`) no entry's client manifest holds,
 * with the entries. (Per entry needs each entry's own required side: a
 * component one entry lacks while another holds it is not reported.)
 */
export function undeliveredReferences(
  required: ReadonlyArray<FlightReference>,
  manifest: RscManifestLike,
): Array<{ reference: FlightReference; entries: Array<string> }> {
  const entries = Object.keys(manifest).sort()
  return required
    .filter(
      (reference) =>
        !entries.some((entry) =>
          Object.hasOwn(manifest[entry]!.clientManifest, reference.resource),
        ),
    )
    .map((reference) => ({ reference, entries }))
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
