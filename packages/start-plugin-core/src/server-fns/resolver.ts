/**
 * The server-function resolver modules (DESIGN §3.13.3, R44): in development
 * a lookup by id through a per-id virtual module that re-exports the
 * provider's `createServerRpc` wrapper from the defining module (compiled
 * through the normal transform, also on a fresh server); in production a
 * manifest of the client-referenced functions (the HTTP-callable set),
 * importing each provider module. Rsbuild uses the manifest in both modes
 * (`manifestResolverModule`): its bundles hold every provider module.
 */
import type { ServerFnEntry } from './registry'

export const SERVER_FN_LOOKUP_VIRTUAL_ID =
  'virtual:tanstack-start-server-fn-lookup'

/**
 * The dev resolver: every call imports the lookup module of the id (never
 * memoised: handlers are hot-replaced). A client-origin call (an HTTP
 * request) imports the lookup under `origin=client`: the lookup warns once
 * for a function no client module references (R44 in development).
 */
export function devResolverModule(): string {
  return `
export async function getServerFnById(id, access) {
  const lookup = ${JSON.stringify(`/@id/__x00__${SERVER_FN_LOOKUP_VIRTUAL_ID}`)} + '?id=' + encodeURIComponent(id) + (access && access.origin === 'client' ? '&origin=client' : '')
  const mod = await import(/* @vite-ignore */ lookup)
  return mod.action
}
`
}

/** The development warning of a client call of a function no client module references (R44). */
export function unreferencedWarning(entry: ServerFnEntry): string {
  return `[tanstack-start] The server function ${entry.name} of ${entry.rootRel} was called from the client, but no client module this dev server compiled references it. A production build refuses such a call: only server functions client code references are callable over HTTP.`
}

/** The dev lookup module of one id: a re-export of the provider wrapper. */
export function devLookupModule(
  entry: ServerFnEntry,
  specifier: string,
): string {
  return `export { ${entry.exportName} as action } from ${JSON.stringify(specifier)}\n`
}

export interface ManifestResolverOptions {
  entries: ReadonlyArray<ServerFnEntry>
  /** The provider module id of an entry (the original module or its derived provider id). */
  providerModuleId: (entry: ServerFnEntry) => string
  /**
   * Only client-referenced functions are HTTP-callable in production (R44):
   * the manifest lists only them, so a function only server code references
   * is "not found" by id (no per-entry flag or runtime check: the filter is
   * the gate). The client built before the provider (the SSR provider). The
   * RSC provider builds before the client (plugin-rsc's `buildApp`), so its
   * manifest lists every server fn of its environment (the RSC build order,
   * FOLLOW-UPS).
   */
  clientReferencedOnly: boolean
  /**
   * Development (R44): every function is listed; a client-origin call of a
   * function no client module the dev server compiled references is
   * answered, with one warning per function naming it and saying a
   * production build refuses it (a stale page after a restart, an external
   * caller, a serialized function).
   */
  warnUnreferenced?: boolean
  /** Import every provider module statically (Rsbuild RSC development). */
  staticImports?: boolean
  /** Keep each imported module on its manifest entry after the first call (production only: modules are never hot-replaced). */
  memoizeModules?: boolean
}

/** The production manifest: `id → { export, importer }` of the HTTP-callable functions. */
export function productionResolverModule(opts: {
  entries: ReadonlyArray<ServerFnEntry>
  providerModuleId: (entry: ServerFnEntry) => string
  clientReferencedOnly: boolean
}): string {
  return manifestResolverModule({ ...opts, memoizeModules: true })
}

/** A manifest resolver module of the registry's entries (both modes on Rsbuild). */
export function manifestResolverModule(opts: ManifestResolverOptions): string {
  const entries = [...opts.entries]
    .filter((e) => !opts.clientReferencedOnly || e.clientReferenced)
    // stable output for content-addressed caches
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const staticImports: Array<string> = []
  const manifest = entries
    .map((e, index) => {
      const moduleRef = `serverFnModule${index}`
      const filename = JSON.stringify(opts.providerModuleId(e))
      if (opts.staticImports) {
        staticImports.push(`import * as ${moduleRef} from ${filename}`)
      }
      const moduleAccess = opts.staticImports
        ? `module: ${moduleRef}`
        : `importer: () => import(${filename})`
      const unreferenced =
        opts.warnUnreferenced && !e.clientReferenced
          ? `,\n    unreferenced: ${JSON.stringify(unreferencedWarning(e))}`
          : ''
      return `${JSON.stringify(e.id)}: {
    functionName: ${JSON.stringify(e.exportName)},
    ${moduleAccess}${unreferenced}
  }`
    })
    .join(',\n  ')
  const warnUnreferenced = opts.warnUnreferenced
    ? `
  if (access && access.origin === 'client' && serverFnInfo.unreferenced) {
    console.warn(serverFnInfo.unreferenced)
    serverFnInfo.unreferenced = undefined
  }
`
    : ''
  // Every import() goes through the ESM loader; a resolved production module
  // can be kept on the manifest entry instead.
  const resolveModule = opts.memoizeModules
    ? 'serverFnInfo.module ??= await serverFnInfo.importer()'
    : 'serverFnInfo.module ?? (await serverFnInfo.importer())'
  return `
${staticImports.join('\n')}
const manifest = {
  ${manifest}
}

export async function getServerFnById(id, access) {
  const serverFnInfo = manifest[id]
  if (!serverFnInfo) {
    throw new Error('Server function info not found for ' + id)
  }
${warnUnreferenced}
  const fnModule = ${resolveModule}
  if (!fnModule) {
    throw new Error('Server function module not resolved for ' + id)
  }
  const action = fnModule[serverFnInfo.functionName]
  if (!action) {
    throw new Error('Server function module export not resolved for serverFn ID: ' + id)
  }
  return action
}

`
}
