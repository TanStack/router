import { START_ENVIRONMENT_NAMES } from '../constants'
import { normalizeViteClientBuild } from './start-manifest-plugin/normalized-client-build'
import type {
  GetConfigFn,
  NormalizedClientBuild,
  ResolvedStartConfig,
} from '../types'
import type { StartEnvironmentName } from '../constants'
import type { PluginOption, ViteBuilder } from 'vite'

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

export function createCaptureClientBuildPlugin(opts: {
  capturedClientBuild: Partial<
    Record<StartEnvironmentName, NormalizedClientBuild>
  >
}): PluginOption {
  return {
    name: 'tanstack-start:core:capture-bundle',
    applyToEnvironment(environment) {
      return environment.name === START_ENVIRONMENT_NAMES.client
    },
    enforce: 'post',
    generateBundle(_options, bundle) {
      const environment = this.environment.name as StartEnvironmentName

      if (environment !== START_ENVIRONMENT_NAMES.client) {
        throw new Error(
          `Unexpected environment for client build capture: ${environment}`,
        )
      }

      opts.capturedClientBuild[environment] = normalizeViteClientBuild(bundle)
    },
  }
}
