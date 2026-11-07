import { existsSync } from 'node:fs'
import { createRouterPluginContext } from '@tanstack/router-plugin/context'
import {
  tanStackRouterCodeSplitter,
  tanstackRouterGenerator,
} from '@tanstack/router-plugin/vite'
import path from 'pathe'
import { normalizePath } from 'vite'
import { VITE_ENVIRONMENT_NAMES } from '../../constants'
import { startGeneratorConfig } from '../../start-router-plugin/generator-config'
import { createClientRouteTree } from '../../start-router-plugin/client-route-tree'
import { escapeRegExp } from '../../utils'
import type { GetConfigFn } from '../../types'
import type { TanStackStartVitePluginCoreOptions } from '../types'
import type { DevEnvironment, Plugin, PluginOption } from 'vite'
import type { TanStackStartInputConfig } from '../../schema'

export function tanStackStartRouter(
  startPluginOpts: TanStackStartInputConfig,
  getConfig: GetConfigFn,
  corePluginOpts: TanStackStartVitePluginCoreOptions,
): Array<PluginOption> {
  const routerPluginContext = createRouterPluginContext()

  const getGeneratedRouteTreePath = () => {
    const { startConfig } = getConfig()
    return path.resolve(startConfig.router.generatedRouteTree)
  }

  let clientEnvironment: DevEnvironment | null = null
  function invalidate() {
    if (!clientEnvironment) {
      return
    }

    const mod = clientEnvironment.moduleGraph.getModuleById(
      getGeneratedRouteTreePath(),
    )
    if (mod) {
      clientEnvironment.moduleGraph.invalidateModule(mod)
    }
    clientEnvironment.hot.send({ type: 'full-reload', path: '*' })
  }

  const clientTree = createClientRouteTree(invalidate)

  let resolvedGeneratedRouteTreePath: string | null = null
  const clientTreePlugin: Plugin = {
    name: 'tanstack-start:route-tree-client-plugin',
    enforce: 'pre',
    applyToEnvironment: (env) => env.name === VITE_ENVIRONMENT_NAMES.client,
    configureServer(server) {
      clientEnvironment = server.environments[VITE_ENVIRONMENT_NAMES.client]
    },
    config() {
      type LoadObjectHook = Extract<
        typeof clientTreePlugin.load,
        { filter?: unknown }
      >
      resolvedGeneratedRouteTreePath = normalizePath(
        getGeneratedRouteTreePath(),
      )
      // The route tree module itself, by its exact id (a query aside)
      ;(clientTreePlugin.load as LoadObjectHook).filter = {
        id: {
          include: new RegExp(
            `^${escapeRegExp(resolvedGeneratedRouteTreePath)}(?:\\?.*)?$`,
          ),
        },
      }
    },

    async resolveId(source, importer, options) {
      // Only relative imports of a mounted module's route tree are redirected
      // to its client view; without route modules nothing is resolved twice.
      if (
        !clientTree.hasModuleTrees() ||
        (!source.startsWith('.') && !path.isAbsolute(source))
      ) {
        return null
      }
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      })
      if (!resolved) {
        return null
      }
      const clientId = clientTree.getModuleClientTree(resolved.id)
      return clientId ? { ...resolved, id: clientId } : null
    },

    load: {
      filter: {
        // this will be set in the config hook above since it relies on `config` hook being called first
      },
      async handler(id) {
        if (
          normalizePath(id.replace(/\?.*$/, '')) !==
          resolvedGeneratedRouteTreePath
        ) {
          return null
        }
        const result = await clientTree.build()
        for (const file of result.dependencies) {
          // The generator watches missing discovery candidates. Vite also
          // resolves load-hook watch files as module dependencies.
          if (existsSync(file)) {
            this.addWatchFile(file)
          }
        }
        return { code: result.code, map: null }
      },
    },
  }
  return [
    clientTreePlugin,
    tanstackRouterGenerator(
      () =>
        startGeneratorConfig({
          getConfig,
          corePluginOpts,
          prerender: startPluginOpts.prerender?.enabled === true,
          clientRouteTree: clientTree.generatorPlugin,
        }),
      routerPluginContext,
    ),
    tanStackRouterCodeSplitter(() => {
      const routerConfig = getConfig().startConfig.router
      return {
        ...routerConfig,
        codeSplittingOptions: {
          ...routerConfig.codeSplittingOptions,
          deleteNodes: ['ssr', 'server', 'headers'],
          addHmr: true,
        },
        plugin: {
          vite: { environmentName: VITE_ENVIRONMENT_NAMES.client },
        },
      }
    }, routerPluginContext),
    tanStackRouterCodeSplitter(() => {
      const routerConfig = getConfig().startConfig.router
      return {
        ...routerConfig,
        codeSplittingOptions: {
          ...routerConfig.codeSplittingOptions,
          addHmr: false,
        },
        plugin: {
          vite: { environmentName: VITE_ENVIRONMENT_NAMES.server },
        },
      }
    }, routerPluginContext),
  ]
}
