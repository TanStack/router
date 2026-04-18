import { normalizePath } from 'vite'
import { ENTRY_POINTS } from '../constants'
import { createVirtualModule } from './createVirtualModule'
import type { GetConfigFn, ResolvedStartConfig } from '../types'
import type { PluginOption, ViteBuilder } from 'vite'

export function createVirtualClientEntryPlugin(opts: {
  getClientEntry: () => string
}): PluginOption {
  return createVirtualModule({
    name: 'tanstack-start-core:virtual-client-entry',
    moduleId: ENTRY_POINTS.client,
    enforce: 'pre',
    load() {
      return `import ${JSON.stringify(normalizePath(opts.getClientEntry()).replaceAll('\\', '/'))}`
    },
  })
}

export function createPostBuildPlugin(opts: {
  getConfig: GetConfigFn
  postServerBuild: (opts: {
    startConfig: ReturnType<GetConfigFn>['startConfig']
    builder: ViteBuilder
  }) => Promise<void>
}): PluginOption {
  return {
    name: 'tanstack-start-core:post-build',
    enforce: 'post',
    buildApp: {
      order: 'post',
      async handler(builder) {
        const { startConfig } = opts.getConfig()
        await opts.postServerBuild({ builder, startConfig })
      },
    },
  }
}

export function createDevBaseRewritePlugin(opts: {
  shouldRewriteDevBase: () => boolean
  resolvedStartConfig: ResolvedStartConfig
}): PluginOption {
  return {
    name: 'tanstack-start-core:dev-base-rewrite',
    configureServer(server) {
      if (!opts.shouldRewriteDevBase()) {
        return
      }

      const basePrefix = opts.resolvedStartConfig.basePaths.publicBase.replace(
        /\/$/,
        '',
      )

      server.middlewares.use((req, _res, next) => {
        if (req.url && !req.url.startsWith(basePrefix)) {
          req.url = basePrefix + req.url
        }

        next()
      })
    },
  }
}
