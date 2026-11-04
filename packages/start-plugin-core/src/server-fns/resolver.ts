/**
 * The server-function resolver modules (J4.2): in development
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
 * for a function no client module references (J4.2 in development: the dev
 * server compiles lazily, so it cannot know every client reference).
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

/** The development warning of a client call of a function no client module references. */
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

interface ManifestResolverOptions {
  entries: ReadonlyArray<ServerFnEntry>
  /** The provider module id of an entry (the original module or its derived provider id). */
  providerModuleId: (entry: ServerFnEntry) => string
  /**
   * Only client-referenced functions are HTTP-callable in production (J4.2):
   * the manifest lists only them, so a function only server code references
   * is "not found" by id (no per-entry flag or runtime check: the filter is
   * the gate). The client built before the provider (the SSR provider). The
   * RSC provider builds before the client (plugin-rsc's `buildApp`), so its
   * manifest lists every server fn of its environment (a known limitation of
   * the RSC build order).
   */
  clientReferencedOnly: boolean
  /**
   * Development: every function is listed; a client-origin call of a
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
  /**
   * Production with a separate provider (RSC): every function is listed
   * (server-origin calls reach the provider through this manifest), and a
   * client-origin call of a function not in this set is refused (J4.2). A
   * JavaScript expression evaluating to the client-referenced ids: a JSON
   * array literal, or a placeholder literal the host replaces once the
   * client build is known.
   */
  clientOriginGate?: string
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
  const gate = opts.clientOriginGate
    ? `\nconst clientCallable = new Set(${opts.clientOriginGate})`
    : ''
  const gated = opts.clientOriginGate
    ? ` || (access && access.origin === 'client' && !clientCallable.has(id))`
    : ''
  return `
${staticImports.join('\n')}
const manifest = {
  ${manifest}
}${gate}

export async function getServerFnById(id, access) {
  const serverFnInfo = manifest[id]
  if (!serverFnInfo${gated}) {
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

/**
 * The caller environment's resolver of a separate provider's production
 * build (J4.2, Vite RSC): the provider built before the client, so its
 * manifest lists every function (server-origin calls need them all); this
 * environment builds after the client and refuses a client-origin call of
 * a function no client module referenced, then forwards to the provider's
 * `getServerFnById` (the module `forwardSpecifier` exports).
 */
export function callerGateModule(
  forwardSpecifier: string,
  clientReferencedIds: ReadonlyArray<string>,
): string {
  const ids = [...clientReferencedIds].sort()
  return `import { getServerFnById as forward } from ${JSON.stringify(forwardSpecifier)}
const clientCallable = new Set(${JSON.stringify(ids)})
export async function getServerFnById(id, access) {
  if (access && access.origin === 'client' && !clientCallable.has(id)) {
    throw new Error('Server function info not found for ' + id)
  }
  return forward(id, access)
}
`
}

/** Replaced in the server bundle by the JSON array of client-referenced ids (Rsbuild RSC builds, after the client compiled). */
export const CLIENT_REFERENCED_IDS_PLACEHOLDER = '__TSS_CLIENT_REFERENCED_IDS__'
