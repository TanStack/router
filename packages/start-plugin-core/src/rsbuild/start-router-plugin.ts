import path from 'pathe'
import {
  tanstackRouterAutoImport,
  tanstackRouterCodeSplitter,
  tanstackRouterGenerator,
} from '@tanstack/router-plugin/rspack'
import { routesManifestPlugin } from '../start-router-plugin/generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from '../start-router-plugin/generator-plugins/prerender-routes-plugin'
import { createRouteTreeModuleDeclaration } from '../start-router-plugin/route-tree-module-declaration'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { setGeneratorInstance } from './route-tree-state'
import { resolveLoaderPath } from './resolve-loader-path'
import type { GetConfigFn, TanStackStartVitePluginCoreOptions } from '../types'
import type { GeneratorPlugin } from '@tanstack/router-generator'
import type { TanStackStartInputConfig } from '../schema'

export function tanStackStartRouterRsbuild(
  startPluginOpts: TanStackStartInputConfig,
  getConfig: GetConfigFn,
  corePluginOpts: TanStackStartVitePluginCoreOptions,
) {
  const getGeneratedRouteTreePath = () => {
    const { startConfig } = getConfig()
    return path.resolve(startConfig.router.generatedRouteTree)
  }

  const clientTreeGeneratorPlugin: GeneratorPlugin = {
    name: 'start-client-tree-plugin',
    init({ generator }) {
      setGeneratorInstance(generator)
    },
  }

  let routeTreeFileFooter: Array<string> | null = null
  function getRouteTreeFileFooter() {
    if (routeTreeFileFooter) {
      return routeTreeFileFooter
    }
    const { startConfig, resolvedStartConfig } = getConfig()
    const ogRouteTreeFileFooter = startConfig.router.routeTreeFileFooter
    if (ogRouteTreeFileFooter) {
      if (Array.isArray(ogRouteTreeFileFooter)) {
        routeTreeFileFooter = ogRouteTreeFileFooter
      } else {
        routeTreeFileFooter = ogRouteTreeFileFooter()
      }
    }
    routeTreeFileFooter = [
      createRouteTreeModuleDeclaration({
        generatedRouteTreePath: getGeneratedRouteTreePath(),
        framework: corePluginOpts.framework,
        startFilePath: resolvedStartConfig.startFilePath,
        routerFilePath: resolvedStartConfig.routerFilePath,
      }),
      ...(routeTreeFileFooter ?? []),
    ]
    return routeTreeFileFooter
  }

  const routeTreeLoaderPath = resolveLoaderPath('./route-tree-loader')

  const generatorPlugin = tanstackRouterGenerator(() => {
    const routerConfig = getConfig().startConfig.router
    const plugins = [clientTreeGeneratorPlugin, routesManifestPlugin()]
    if (startPluginOpts?.prerender?.enabled === true) {
      plugins.push(prerenderRoutesPlugin())
    }
    return {
      ...routerConfig,
      target: corePluginOpts.framework,
      routeTreeFileFooter: getRouteTreeFileFooter(),
      plugins,
    }
  })

  const clientCodeSplitter = tanstackRouterCodeSplitter(() => {
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
  })

  const serverCodeSplitter = tanstackRouterCodeSplitter(() => {
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
  })

  const autoImport = tanstackRouterAutoImport(startPluginOpts?.router)

  return {
    generatorPlugin,
    clientCodeSplitter,
    serverCodeSplitter,
    autoImport,
    routeTreeLoaderPath,
    getGeneratedRouteTreePath,
  }
}
