import {
  START_ENVIRONMENT_NAMES,
  tanStackStartVite,
} from '@tanstack/start-plugin-core/vite'
import { octaneRouteGeneratorPlugin } from '@tanstack/octane-router/generator-plugin'
import { octane } from 'octane/compiler/vite'
import { octaneStartDefaultEntryPaths } from './shared'
import { validateOctaneCompilerOptions } from './validate-options'
import type {
  TanStackStartViteInputConfig,
  TanStackStartVitePluginCoreOptions,
} from '@tanstack/start-plugin-core/vite'
import type { PluginOption } from 'vite'

export interface OctaneRendererDescriptor {
  module: string
  target?: 'dom' | 'universal'
  server?: 'render' | 'client-only' | 'unsupported'
  intrinsics?: string
  text?: 'reject' | 'ignore' | 'host'
  capabilities?: Array<string>
}

export interface OctaneRendererBoundary {
  ownerRenderer: string
  childRenderer: string
  prop: string
  server?: 'omit-child'
}

export interface OctaneRendererRule {
  include: string | Array<string>
  exclude?: string | Array<string>
  renderer: string
}

export interface OctaneRendererConfig {
  default?: string
  registry?: Record<string, string | OctaneRendererDescriptor>
  rules?: Array<OctaneRendererRule>
  boundaries?: Record<string, Record<string, OctaneRendererBoundary>>
}

export interface OctaneCompilerOptions {
  exclude?: Array<string>
  hmr?: boolean
  profile?: boolean
  renderers?: OctaneRendererConfig
}

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
                  exclude: [
                    '@tanstack/octane-start',
                    '@tanstack/octane-router',
                    '@tanstack/start-static-server-functions',
                    'octane',
                  ],
                }
              : undefined,
        }
      },
    },
    tanStackStartVite(corePluginOptions, startOptions),
  ]
}
