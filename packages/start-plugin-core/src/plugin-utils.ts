import type { DevEnvironment, Environment, Plugin, Rollup } from 'vite'
import type { ModuleLoaderApi } from './module-loader-plugin'

// ============ Types ============

/**
 * Plugin context type that works across different TypeScript/Vite versions.
 * Extends Rollup's TransformPluginContext with Vite's environment additions.
 *
 * Uses Vite's Environment type which is a union of DevEnvironment, BuildEnvironment,
 * and UnknownEnvironment.
 */
export type PluginContext = Rollup.TransformPluginContext & {
  environment: Environment
}

/**
 * Type guard to check if an environment is a DevEnvironment (has fetchModule).
 */
export function isDevEnvironment(env: Environment): env is DevEnvironment {
  return env.mode === 'dev'
}

// ============ Utilities ============

/**
 * Strip query string from a module ID to get the clean file path.
 */
export function stripQueryString(id: string): string {
  return id.split('?')[0]!
}

/**
 * Find the module loader API from environment plugins.
 * Throws if the module loader plugin is not found.
 */
export function findModuleLoaderApi(
  envPlugins: ReadonlyArray<Plugin>,
): ModuleLoaderApi {
  const loaderPlugin = envPlugins.find(
    (p): p is Plugin & { api: ModuleLoaderApi } =>
      p.name === 'tanstack-module-loader' && !!p.api,
  )
  if (!loaderPlugin) {
    throw new Error(
      'Module loader plugin not found. Ensure moduleLoaderPlugin() is added before other TanStack Start plugins.',
    )
  }
  return loaderPlugin.api
}
