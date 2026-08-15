import { VIRTUAL_MODULES } from '@tanstack/start-server-core/virtual-modules'
import { generateServerFnResolverModule } from '../start-compiler/server-fn-resolver-module'
import {
  buildStartManifest,
  serializeStartManifest,
} from '../start-manifest-plugin/manifestBuilder'
import type { ServerFn } from '../start-compiler/types'
import type { NormalizedClientBuild } from '../types'
import type { ScriptFormat } from '@tanstack/router-core'

export { VIRTUAL_MODULES }

export interface BunVirtualModuleStore {
  get: (id: string) => string | undefined
  set: (id: string, contents: string) => void
  has: (id: string) => boolean
  clear: () => void
  updateServerFnResolver: (
    serverFnsById: Record<string, ServerFn>,
    opts: { includeClientReferencedCheck: boolean },
  ) => void
  updateManifest: (opts: {
    clientBuild: NormalizedClientBuild
    publicBase: string
    scriptFormat?: ScriptFormat
    inlineCss?: { enabled: boolean; transformAssets: boolean }
  }) => void
}

export function createBunVirtualModuleStore(): BunVirtualModuleStore {
  const modules = new Map<string, string>()

  return {
    get(id) {
      return modules.get(id)
    },
    set(id, contents) {
      modules.set(id, contents)
    },
    has(id) {
      return modules.has(id)
    },
    clear() {
      modules.clear()
    },
    updateServerFnResolver(serverFnsById, opts) {
      const code = generateServerFnResolverModule({
        serverFnsById,
        includeClientReferencedCheck: opts.includeClientReferencedCheck,
      })
      modules.set(VIRTUAL_MODULES.serverFnResolver, code)
    },
    updateManifest({ clientBuild, publicBase, scriptFormat, inlineCss }) {
      const routeTreeRoutes =
        (
          globalThis as {
            TSS_ROUTES_MANIFEST?: Parameters<
              typeof buildStartManifest
            >[0]['routeTreeRoutes']
          }
        ).TSS_ROUTES_MANIFEST ?? {}

      const startManifest = buildStartManifest({
        clientBuild,
        routeTreeRoutes,
        basePath: publicBase,
        inlineCss,
        scriptFormat: scriptFormat ?? 'module',
      })

      const serialized = serializeStartManifest(startManifest)
      modules.set(
        VIRTUAL_MODULES.startManifest,
        `export const tsrStartManifest = () => (${serialized})`,
      )
    },
  }
}

/** Match virtual / aliased module IDs that should not hit the filesystem. */
export function isBunVirtualModuleId(id: string): boolean {
  return (
    id === VIRTUAL_MODULES.serverFnResolver ||
    id === VIRTUAL_MODULES.startManifest ||
    id === VIRTUAL_MODULES.pluginAdapters ||
    id.startsWith('virtual:tanstack-') ||
    id.startsWith('#tanstack-') ||
    id.startsWith('tanstack-start-')
  )
}
