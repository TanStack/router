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

/** The dev resolver: every call imports the lookup module of the id (never memoised: handlers are hot-replaced). */
export function devResolverModule(): string {
  return `
export async function getServerFnById(id, _access) {
  const lookup = ${JSON.stringify(`/@id/__x00__${SERVER_FN_LOOKUP_VIRTUAL_ID}`)} + '?id=' + encodeURIComponent(id)
  const mod = await import(/* @vite-ignore */ lookup)
  return mod.action
}
`
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
   * the client built before the provider (the SSR provider). The RSC
   * provider builds before the client (plugin-rsc's `buildApp`), so its
   * manifest lists every server fn of its environment without the check.
   * Development is permissive (every entry, no check).
   */
  clientReferencedOnly: boolean
  /** Import every provider module statically (Rsbuild RSC development). */
  staticImports?: boolean
  /** Keep each imported module on its manifest entry after the first call (production only: modules are never hot-replaced). */
  memoizeModules?: boolean
}

/** The production manifest: `id → { export, importer, isClientReferenced }` with the origin check. */
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
      const clientReferenced = opts.clientReferencedOnly
        ? `,\n    isClientReferenced: ${e.clientReferenced}`
        : ''
      return `${JSON.stringify(e.id)}: {
    functionName: ${JSON.stringify(e.exportName)},
    ${moduleAccess}${clientReferenced}
  }`
    })
    .join(',\n  ')
  const clientReferencedCheck = opts.clientReferencedOnly
    ? `
  if (access.origin === 'client' && !serverFnInfo.isClientReferenced) {
    throw new Error('Server function not accessible from client: ' + id)
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
${clientReferencedCheck}
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
