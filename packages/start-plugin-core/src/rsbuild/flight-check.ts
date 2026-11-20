/**
 * The Flight completion check of an Rsbuild RSC production build (RSC
 * decision 4 and phase 3b, design-rsc-phase2.md §5.1). Rspack's RSC
 * ServerPlugin hands the client compilation the client references of the
 * `rsc` graph once (server `finishMake` stage 0). A module the server
 * compilation builds later (its last settlement run: a server fn only
 * client code calls) can bring a `'use client'` component no reference was
 * handed for: the client build has no module of it, and the browser cannot
 * decode a server fn result that renders it. The check compares the live
 * client references of the `rsc` environment's chunks with the per-entry
 * client manifests Rspack reports (`onManifest`); it runs only in a
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

/** A client reference the `rsc` environment's chunks hold: a `'use client'` module with a used export. */
export interface FlightReference {
  resource: string
  /** Its used exports (`true`: all or unknown). */
  exports: ReadonlyArray<string> | true
}

/**
 * The live client references of an RSC server compilation's `rsc`
 * environment: its modules in a chunk whose file is a `'use client'`
 * module (`useClient`, the raw fact) and that have a used export.
 */
export async function liveClientReferences(
  compilation: RspackCompilationLike,
  isRscModule: (module: RspackModuleLike, holder: RspackModuleLike) => boolean,
  useClient: (resource: string) => Promise<boolean>,
): Promise<Array<FlightReference>> {
  const candidates = new Map<string, RspackModuleLike>()
  forEachChunkModule(compilation, (module, holder) => {
    const resource = module.resource
    if (resource && !candidates.has(resource) && isRscModule(module, holder)) {
      candidates.set(resource, module)
    }
  })
  const runtimes = runtimesOf(compilation)
  const out: Array<FlightReference> = []
  for (const [resource, module] of candidates) {
    if (!(await useClient(resource))) {
      continue
    }
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

/** The references (`liveClientReferences`) an entry's client manifest lacks, with the entries lacking each. */
export function undeliveredReferences(
  required: ReadonlyArray<FlightReference>,
  manifest: RscManifestLike,
): Array<{ reference: FlightReference; entries: Array<string> }> {
  const out: Array<{ reference: FlightReference; entries: Array<string> }> = []
  for (const reference of required) {
    const entries = Object.keys(manifest)
      .filter(
        (entry) =>
          !Object.hasOwn(manifest[entry]!.clientManifest, reference.resource),
      )
      .sort()
    if (entries.length > 0) {
      out.push({ reference, entries })
    }
  }
  return out
}

/** The warning of a client reference the client build lacks. */
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
    `[tanstack-start] The client component ${file}${exports} is rendered by server code the RSC build reached only after it handed the client build its client components (entry ${missing.entries.join(', ')}): the client build has no module of it, and the browser cannot show a server function result that renders it (a server function only client code calls, whose handler renders it).`,
    `  Render ${file} from server code the build reaches before the client: a server component of a route, or a server function a route's loader calls.`,
  ].join('\n')
}
