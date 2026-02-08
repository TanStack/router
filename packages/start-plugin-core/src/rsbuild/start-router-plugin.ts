import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'pathe'
import {
  tanstackRouterAutoImport,
  tanstackRouterCodeSplitter,
  tanstackRouterGenerator,
} from '@tanstack/router-plugin/rspack'
import { routesManifestPlugin } from '../start-router-plugin/generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from '../start-router-plugin/generator-plugins/prerender-routes-plugin'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { setGeneratorInstance } from './route-tree-state'
import type { GetConfigFn, TanStackStartVitePluginCoreOptions } from '../types'
import type { GeneratorPlugin } from '@tanstack/router-generator'
import type { TanStackStartInputConfig } from '../schema'

function moduleDeclaration({
  startFilePath,
  routerFilePath,
  corePluginOpts,
  generatedRouteTreePath,
}: {
  startFilePath: string | undefined
  routerFilePath: string
  corePluginOpts: TanStackStartVitePluginCoreOptions
  generatedRouteTreePath: string
}): string {
  function getImportPath(absolutePath: string) {
    let relativePath = path.relative(
      path.dirname(generatedRouteTreePath),
      absolutePath,
    )

    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath
    }

    relativePath = relativePath.split(path.sep).join('/')
    return relativePath
  }

  const result: Array<string> = [
    `import type { getRouter } from '${getImportPath(routerFilePath)}'`,
  ]
  if (startFilePath) {
    result.push(
      `import type { startInstance } from '${getImportPath(startFilePath)}'`,
    )
  } else {
    result.push(
      `import type { createStart } from '@tanstack/${corePluginOpts.framework}-start'`,
    )
  }
  result.push(
    `declare module '@tanstack/${corePluginOpts.framework}-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>`,
  )
  if (startFilePath) {
    result.push(
      `    config: Awaited<ReturnType<typeof startInstance.getOptions>>`,
    )
  }
  result.push(`  }
}`)

  return result.join('\n')
}

function resolveLoaderPath(relativePath: string) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const basePath = path.resolve(currentDir, relativePath)
  const jsPath = `${basePath}.js`
  const tsPath = `${basePath}.ts`
  if (fs.existsSync(jsPath)) return jsPath
  if (fs.existsSync(tsPath)) return tsPath
  return jsPath
}

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
      moduleDeclaration({
        generatedRouteTreePath: getGeneratedRouteTreePath(),
        corePluginOpts,
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
