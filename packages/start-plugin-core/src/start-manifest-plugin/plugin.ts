import { joinURL } from 'ufo'
import { VIRTUAL_MODULES } from '@tanstack/start-server-core'
import { resolveViteId } from '../utils'
import { ENTRY_POINTS } from '../constants'
import { buildStartManifest } from './manifestBuilder'
import type { GetConfigFn } from '../types'
import type { PluginOption, Rollup } from 'vite'

const resolvedModuleId = resolveViteId(VIRTUAL_MODULES.startManifest)

export function startManifestPlugin(opts: {
  getClientBundle: () => Rollup.OutputBundle
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
          if (
            this.environment.name !== resolvedStartConfig.serverFnProviderEnv
          ) {
            return `export default {}`
          }

          if (this.environment.config.command === 'serve') {
            return `export const tsrStartManifest = () => ({
            routes: {},
            clientEntry: '${joinURL(resolvedStartConfig.viteAppBase, '@id', ENTRY_POINTS.client)}',
          })`
          }

          const routeTreeRoutes = globalThis.TSS_ROUTES_MANIFEST
          const startManifest = buildStartManifest({
            clientBundle: opts.getClientBundle(),
            routeTreeRoutes,
            basePath: resolvedStartConfig.viteAppBase,
          })

          return `export const tsrStartManifest = () => (${JSON.stringify(startManifest)})`
        }

        return undefined
      },
    },
  }
}
