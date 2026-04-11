import { joinURL } from 'ufo'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { resolveViteId } from '../../utils'
import { ENTRY_POINTS, START_ENVIRONMENT_NAMES } from '../../constants'
import {
  buildStartManifest,
  serializeStartManifest,
} from '../../start-manifest-plugin/manifestBuilder'
import type { GetConfigFn, NormalizedClientBuild } from '../../types'
import type { PluginOption } from 'vite'

const resolvedModuleId = resolveViteId(VIRTUAL_MODULES.startManifest)

export function startManifestPlugin(opts: {
  getClientBuild: () => NormalizedClientBuild | undefined
  getConfig: GetConfigFn
}): PluginOption {
  return {
    name: 'tanstack-start:start-manifest-plugin',
    enforce: 'pre',
    resolveId: {
      filter: { id: new RegExp(VIRTUAL_MODULES.startManifest) },
      handler(id) {
        if (id === VIRTUAL_MODULES.startManifest) {
          return resolvedModuleId
        }
        return undefined
      },
    },
    load: {
      filter: {
        id: new RegExp(resolvedModuleId),
      },
      handler(id) {
        const { resolvedStartConfig } = opts.getConfig()
        if (id === resolvedModuleId) {
          if (this.environment.name !== START_ENVIRONMENT_NAMES.server) {
            return 'export default {}'
          }

          if (this.environment.config.command === 'serve') {
            return `export const tsrStartManifest = () => ({
            routes: {},
            clientEntry: '${joinURL(resolvedStartConfig.basePaths.publicBase, '@id', ENTRY_POINTS.client)}',
          })`
          }

          const routeTreeRoutes = globalThis.TSS_ROUTES_MANIFEST
          const clientBuild = opts.getClientBuild()
          // TODO this needs further discussion with vite-rsc, this is a temporary workaround
          // If the client bundle isn't available yet (e.g., during RSC scan builds),
          // return a dummy manifest. The real manifest will be generated in the actual build.
          if (!clientBuild) {
            return `export const tsrStartManifest = () => ({
              routes: {},
              clientEntry: '${joinURL(resolvedStartConfig.basePaths.publicBase, '@id', ENTRY_POINTS.client)}',
              })`
          }
          const startManifest = buildStartManifest({
            clientBuild,
            routeTreeRoutes,
            basePath: resolvedStartConfig.basePaths.publicBase,
          })

          return `export const tsrStartManifest = () => (${serializeStartManifest(startManifest)})`
        }

        return undefined
      },
    },
  }
}
