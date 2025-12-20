import type { DevEnvironment, Environment, Plugin, PluginOption } from 'vite'
import { isDevEnvironment } from '../plugin-utils'

export const MODULE_LOADER_QUERY_KEY = 'tss-module-load'

/**
 * Interface for the module loader API exposed to other plugins.
 */
export interface ModuleLoaderApi {
  /**
   * Load a module's transformed code by its resolved ID.
   * Works in both dev and build modes.
   *
   * @param env - The environment to load the module in
   * @param id - The resolved module ID to load
   * @param ctxLoad - In build mode, pass ctx.load bound to ctx
   * @returns The transformed module code
   */
  loadModuleCode(
    env: Environment,
    id: string,
    ctxLoad?: (options: { id: string }) => Promise<{ code: string | null }>,
  ): Promise<string>
}

/**
 * Plugin that provides module loading capabilities to other plugins.
 * This plugin must be added before plugins that need to load module code.
 *
 * In build mode, uses Vite's ctx.load() which returns code directly.
 * In dev mode, uses fetchModule with a capture plugin since ctx.load()
 * doesn't return code in dev mode.
 *
 * @example
 * ```typescript
 * // In another plugin:
 * const loaderPlugin = this.environment.plugins.find(
 *   p => p.name === 'tanstack-module-loader'
 * )
 * const code = await loaderPlugin.api.loadModuleCode(this, resolvedId)
 * ```
 */
export function moduleLoaderPlugin(): PluginOption {
  // Cache of loaded module code per environment
  // Map: envName -> (id -> code)
  const moduleCache = new Map<string, Map<string, string>>()

  // Pending load requests for dev mode async loading
  // Map: envName -> (id -> { resolve, reject })
  const pendingLoads = new Map<
    string,
    Map<
      string,
      {
        resolve: (code: string) => void
        reject: (err: Error) => void
      }
    >
  >()

  function getEnvCache(envName: string): Map<string, string> {
    let cache = moduleCache.get(envName)
    if (!cache) {
      cache = new Map()
      moduleCache.set(envName, cache)
    }
    return cache
  }

  function getEnvPendingLoads(
    envName: string,
  ): Map<
    string,
    { resolve: (code: string) => void; reject: (err: Error) => void }
  > {
    let pending = pendingLoads.get(envName)
    if (!pending) {
      pending = new Map()
      pendingLoads.set(envName, pending)
    }
    return pending
  }

  const mainPlugin: Plugin = {
    name: 'tanstack-module-loader',

    api: {
      async loadModuleCode(
        env: Environment,
        id: string,
        ctxLoad?: (options: { id: string }) => Promise<{ code: string | null }>,
      ): Promise<string> {
        const envName = env.name

        // Check cache first
        const envCache = getEnvCache(envName)
        const cached = envCache.get(id)
        if (cached !== undefined) {
          return cached
        }

        if (env.mode === 'build') {
          // In build mode, use the provided ctxLoad
          if (!ctxLoad) {
            throw new Error(
              `loadModuleCode requires ctxLoad in build mode for module: ${id}`,
            )
          }
          const loaded = await ctxLoad({ id })
          if (!loaded.code) {
            throw new Error(`Could not load module: ${id}`)
          }
          // Cache it
          envCache.set(id, loaded.code)
          return loaded.code
        } else if (isDevEnvironment(env)) {
          // In dev mode, use fetchModule with capture plugin
          // The fetchModule triggers Vite to load and transform the module,
          // and our capture plugin intercepts it to get the code
          const devEnv: DevEnvironment = env
          return new Promise((resolve, reject) => {
            // Register pending load
            const envPending = getEnvPendingLoads(envName)
            envPending.set(id, { resolve, reject })

            // Trigger fetch - the capture plugin will intercept and resolve
            devEnv
              .fetchModule(id + '?' + MODULE_LOADER_QUERY_KEY)
              .catch((err: Error) => {
                // Clean up pending on error
                envPending.delete(id)
                reject(err)
              })
          })
        } else {
          throw new Error(
            `Could not load module ${id}: unsupported environment mode`,
          )
        }
      },
    } satisfies ModuleLoaderApi,

    // Invalidate cache on HMR
    hotUpdate(ctx) {
      const envCache = moduleCache.get(this.environment.name)
      if (envCache) {
        for (const mod of ctx.modules) {
          if (mod.id) {
            envCache.delete(mod.id)
          }
        }
      }
    },
  }

  // Capture plugin for dev mode - intercepts the fetchModule request
  const capturePlugin: Plugin = {
    name: 'tanstack-module-loader:capture',
    apply: 'serve',

    transform: {
      filter: {
        id: new RegExp(`\\?${MODULE_LOADER_QUERY_KEY}$`),
      },
      handler(code, id) {
        // Remove query parameter to get clean ID
        const cleanId = id.replace('?' + MODULE_LOADER_QUERY_KEY, '')
        const envName = this.environment.name

        // Cache the code
        const envCache = getEnvCache(envName)
        envCache.set(cleanId, code)

        // Resolve pending load if any
        const envPending = pendingLoads.get(envName)
        const pending = envPending?.get(cleanId)
        if (pending) {
          pending.resolve(code)
          envPending!.delete(cleanId)
        }

        // Return null to not affect the module transform
        return null
      },
    },
  }

  return [mainPlugin, capturePlugin]
}
