/**
 * The server-function resolver modules (DESIGN §3.13.3, R44): in development
 * a lookup by id through a per-id virtual module that re-exports the
 * provider's `createServerRpc` wrapper from the defining module (compiled
 * through the normal transform, also on a fresh server); in production a
 * manifest of the client-referenced functions (the HTTP-callable set),
 * importing each provider module.
 */
import { generateServerFnResolverModule } from '../start-compiler/server-fn-resolver-module'
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

export interface ProductionResolverOptions {
  entries: ReadonlyArray<ServerFnEntry>
  /** The provider module id of an entry (the original module or its derived provider id). */
  providerModuleId: (entry: ServerFnEntry) => string
  /** Only client-referenced functions are HTTP-callable in production (R44). */
  clientReferencedOnly: boolean
}

/** The production manifest: `id → { export, importer, isClientReferenced }` with the origin check. */
export function productionResolverModule(
  opts: ProductionResolverOptions,
): string {
  const serverFnsById: Record<
    string,
    {
      functionName: string
      functionId: string
      filename: string
      extractedFilename: string
      isClientReferenced?: boolean
    }
  > = {}
  for (const e of opts.entries) {
    if (opts.clientReferencedOnly && !e.clientReferenced) {
      continue
    }
    serverFnsById[e.id] = {
      functionName: e.exportName,
      functionId: e.id,
      filename: e.definingCanonicalId,
      extractedFilename: opts.providerModuleId(e),
      isClientReferenced: e.clientReferenced,
    }
  }
  return generateServerFnResolverModule({
    serverFnsById,
    includeClientReferencedCheck: true,
    memoizeModules: true,
  })
}
