import {
  START_ENVIRONMENT_NAMES,
  tanStackStartVite,
} from '@tanstack/start-plugin-core/vite'
import { octaneRouteGeneratorPlugin } from '@tanstack/octane-router/generator-plugin'
import { octane } from 'octane/compiler/vite'
import { octaneStartDefaultEntryPaths } from './shared'
import { transformOctaneStartSource } from './source-transform'
import { validateOctaneCompilerOptions } from './validate-options'
import type {
  TanStackStartViteInputConfig,
  TanStackStartVitePluginCoreOptions,
} from '@tanstack/start-plugin-core/vite'
import type {
  OctaneRendererBoundaryOptions,
  OctaneRendererConfigOptions,
  OctaneRendererRegistryEntry,
  OctaneRendererRuleOptions,
  OctaneVitePluginOptions,
} from 'octane/compiler/vite'
import type { PluginOption } from 'vite'

// These modules must remain source-served so Start can remove their
// environment-specific branches. The router subpaths are predeclared to avoid
// a cold-cache optimized-dependency reload during hydration.
const SOURCE_DEPENDENCY_EXCLUDES = [
  '@tanstack/octane-start',
  '@tanstack/octane-start-client',
  '@tanstack/octane-router',
  '@tanstack/start-client-core',
  '@tanstack/start-storage-context',
  '@tanstack/start-fn-stubs',
  '@tanstack/start-static-server-functions',
  'octane',
]

const SOURCE_DEPENDENCY_INCLUDES = [
  '@tanstack/octane-router > @tanstack/router-core/isServer',
  '@tanstack/octane-router > @tanstack/router-core/scroll-restoration-script',
]

export type OctaneRendererDescriptor = Exclude<
  OctaneRendererRegistryEntry,
  string
>
export type OctaneRendererBoundary = OctaneRendererBoundaryOptions
export type OctaneRendererRule = OctaneRendererRuleOptions
export type OctaneRendererConfig = OctaneRendererConfigOptions
export type OctaneCompilerOptions = Omit<OctaneVitePluginOptions, 'ssr'>

export type TanStackOctaneStartViteInputConfig =
  TanStackStartViteInputConfig & {
    octane?: OctaneCompilerOptions
  }

export function tanstackStart(
  options?: TanStackOctaneStartViteInputConfig,
): Array<PluginOption> {
  const { octane: octaneOptions, ...startOptions } = options ?? {}
  validateOctaneCompilerOptions(octaneOptions)

  const corePluginOptions: TanStackStartVitePluginCoreOptions = {
    framework: 'octane',
    defaultEntryPaths: octaneStartDefaultEntryPaths,
    providerEnvironmentName: START_ENVIRONMENT_NAMES.server,
    ssrIsProvider: true,
    ssrResolverStrategy: {
      type: 'default',
    },
    routerGeneratorPlugins: [octaneRouteGeneratorPlugin()],
  }

  return [
    {
      name: 'tanstack-octane-start:source-transform',
      enforce: 'pre',
      transform: {
        filter: {
          id: { include: [/\.tsrx($|\?)/] },
          code: { include: ['Hydrate', 'ClientOnly'] },
        },
        handler(code, id, transformOptions) {
          return transformOctaneStartSource(code, id, {
            server:
              transformOptions?.ssr === true ||
              this.environment.name === START_ENVIRONMENT_NAMES.server,
          })
        },
      },
    },
    octane(octaneOptions),
    {
      name: 'tanstack-octane-start:config',
      configEnvironment(environmentName, options) {
        return {
          optimizeDeps:
            environmentName === START_ENVIRONMENT_NAMES.client ||
            (environmentName === START_ENVIRONMENT_NAMES.server &&
              options.optimizeDeps?.noDiscovery === false)
              ? {
                  exclude: [...SOURCE_DEPENDENCY_EXCLUDES],
                  include: [...SOURCE_DEPENDENCY_INCLUDES],
                }
              : undefined,
        }
      },
    },
    tanStackStartVite(corePluginOptions, startOptions),
  ]
}
