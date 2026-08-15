/**
 * Bun-native code-splitter (esbuild-adjacent onResolve/onLoad).
 * Mirrors createRouterCodeSplitterPlugin transform handlers without unplugin.
 *
 * Reference-file transforms must be applied by the Start compiler host (or another
 * onLoad owner) because Bun only allows one successful onLoad per module.
 * This plugin only owns `tsr-split` / `tsr-shared` virtual modules.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { decodeIdentifier, logDiff } from '@tanstack/router-utils'
import { getConfig, splitGroupingsSchema } from './config'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
  detectCodeSplitGroupingsFromRoute,
} from './code-splitter/compilers'
import { getFrameworkHmrCompilerPlugins } from './code-splitter/plugins/framework-plugins'
import {
  defaultCodeSplitGroupings,
  splitRouteIdentNodes,
  tsrShared,
  tsrSplit,
} from './constants'
import { debug, normalizePath, routeFactoryCallCodeFilter } from './utils'
import type { CodeSplitGroupings, SplitRouteIdentNodes } from './constants'
import type { GetRoutesByFileMapResultValue } from '@tanstack/router-generator'
import type { CodeSplitCompilerPlugin } from './code-splitter/plugins'
import type { Config, HmrStyle } from './config'
import type { RouterPluginContext } from './router-plugin-context'
import type { BunPlugin } from 'bun'

export type BunCodeSplitterOptions = {
  root: string
  isProduction?: boolean
  /** Merged into getConfig / function options */
  config?: Partial<Config> | (() => Config)
}

export type BunCodeSplitterRuntime = {
  plugin: BunPlugin
  /** Apply reference-route code-splitting; returns original code when unchanged. */
  transformReference: (code: string, id: string) => string
  /**
   * Compile `?tsr-split=` / `?tsr-shared=` virtual modules.
   * Used by Bun Start ESM-dev middleware (Bun.build uses the plugin onLoad path).
   */
  transformVirtual: (code: string, id: string) => string
}

function matchesRouteFactory(code: string): boolean {
  return routeFactoryCallCodeFilter.some((re) => re.test(code))
}

function loaderForPath(filePath: string): 'tsx' | 'ts' | 'jsx' | 'js' {
  if (filePath.endsWith('.tsx')) {
    return 'tsx'
  }
  if (filePath.endsWith('.jsx')) {
    return 'jsx'
  }
  if (filePath.endsWith('.ts')) {
    return 'ts'
  }
  return 'js'
}

function stripQuery(id: string): string {
  const q = id.indexOf('?')
  return q >= 0 ? id.slice(0, q) : id
}

/**
 * Create Bun code-splitter runtime: virtual-module plugin + reference transform.
 */
export function createBunRouterCodeSplitterRuntime(
  routerPluginContext: RouterPluginContext,
  bunOptions: BunCodeSplitterOptions,
): BunCodeSplitterRuntime {
  const isProduction =
    bunOptions.isProduction ?? process.env.NODE_ENV === 'production'
  const ROOT = bunOptions.root

  let userConfig: Config
  let addHmr: boolean
  let hmrStyle: HmrStyle
  let compilerPlugins: Array<CodeSplitCompilerPlugin>
  let virtualRouteCompilerPlugins: Array<CodeSplitCompilerPlugin>

  const sharedBindingsMap = new Map<string, Set<string>>()

  const initUserConfig = () => {
    const options = bunOptions.config ?? {}
    if (typeof options === 'function') {
      userConfig = options()
    } else {
      userConfig = getConfig(options, ROOT)
    }

    addHmr = (userConfig.codeSplittingOptions?.addHmr ?? true) && !isProduction
    hmrStyle = userConfig.plugin?.hmr?.style ?? 'vite'
    compilerPlugins = [
      ...(addHmr
        ? (getFrameworkHmrCompilerPlugins({
            targetFramework: userConfig.target,
            hmrStyle,
          }) ?? [])
        : []),
      ...(userConfig.codeSplittingOptions?.compilerPlugins ?? []),
    ]
    virtualRouteCompilerPlugins = compilerPlugins.filter(
      (plugin) => plugin.onVirtualRouteSplitNode,
    )
  }

  initUserConfig()

  const getGlobalCodeSplitGroupings = () => {
    return (
      userConfig.codeSplittingOptions?.defaultBehavior ||
      defaultCodeSplitGroupings
    )
  }
  const getShouldSplitFn = () => {
    return userConfig.codeSplittingOptions?.splitBehavior
  }

  const handleCompilingReferenceFile = (
    code: string,
    id: string,
    generatorNodeInfo: GetRoutesByFileMapResultValue,
  ): { code: string } | null => {
    if (debug) {
      console.info('[bun code-splitter] Compiling Route: ', id)
    }

    const fromCode = detectCodeSplitGroupingsFromRoute({
      code,
      filename: id,
    })

    if (fromCode.groupings !== undefined) {
      const res = splitGroupingsSchema.safeParse(fromCode.groupings)
      if (!res.success) {
        const message = res.error.issues.map((e) => e.message).join('. ')
        throw new Error(
          `The groupings for the route "${id}" are invalid.\n${message}`,
        )
      }
    }

    const userShouldSplitFn = getShouldSplitFn()
    const pluginSplitBehavior = userShouldSplitFn?.({
      routeId: generatorNodeInfo.routeId,
    }) as CodeSplitGroupings | undefined

    if (pluginSplitBehavior) {
      const res = splitGroupingsSchema.safeParse(pluginSplitBehavior)
      if (!res.success) {
        const message = res.error.issues.map((e) => e.message).join('. ')
        throw new Error(
          `The groupings returned when using \`splitBehavior\` for the route "${id}" are invalid.\n${message}`,
        )
      }
    }

    const splitGroupings: CodeSplitGroupings =
      fromCode.groupings ?? pluginSplitBehavior ?? getGlobalCodeSplitGroupings()

    const sharedBindings = computeSharedBindings({
      code,
      filename: id,
      codeSplitGroupings: splitGroupings,
    })
    if (sharedBindings.size > 0) {
      sharedBindingsMap.set(id, sharedBindings)
    } else {
      sharedBindingsMap.delete(id)
    }

    const compiledReferenceRoute = compileCodeSplitReferenceRoute({
      code,
      codeSplitGroupings: splitGroupings,
      targetFramework: userConfig.target,
      filename: id,
      id,
      deleteNodes: userConfig.codeSplittingOptions?.deleteNodes
        ? new Set(userConfig.codeSplittingOptions.deleteNodes)
        : undefined,
      addHmr,
      hmrStyle,
      hmrRouteId: generatorNodeInfo.routeId,
      sharedBindings: sharedBindings.size > 0 ? sharedBindings : undefined,
      compilerPlugins,
    })

    if (compiledReferenceRoute === null) {
      return null
    }
    if (debug) {
      logDiff(code, compiledReferenceRoute.code)
    }
    return compiledReferenceRoute
  }

  const handleCompilingVirtualFile = (code: string, id: string) => {
    if (debug) {
      console.info('[bun code-splitter] Splitting Route: ', id)
    }

    const [_, ...pathnameParts] = id.split('?')
    const searchParams = new URLSearchParams(pathnameParts.join('?'))
    const splitValue = searchParams.get(tsrSplit)

    if (!splitValue) {
      throw new Error(
        `The split value for the virtual route "${id}" was not found.`,
      )
    }

    const rawGrouping = decodeIdentifier(splitValue)
    const grouping = [...new Set(rawGrouping)].filter((p) =>
      splitRouteIdentNodes.includes(p as any),
    ) as Array<SplitRouteIdentNodes>

    const baseId = id.split('?')[0]!
    const resolvedSharedBindings = sharedBindingsMap.get(baseId)

    const result = compileCodeSplitVirtualRoute({
      code,
      filename: id,
      splitTargets: grouping,
      sharedBindings: resolvedSharedBindings,
      compilerPlugins: virtualRouteCompilerPlugins,
    })

    if (debug) {
      logDiff(code, result.code)
    }
    return result
  }

  const handleCompilingSharedFile = (code: string, id: string) => {
    const url = pathToFileURL(id)
    url.searchParams.delete('v')
    const normalizedId = normalizePath(fileURLToPath(url))
    const [baseId] = normalizedId.split('?')
    if (!baseId) {
      return null
    }

    const sharedBindings = sharedBindingsMap.get(baseId)
    if (!sharedBindings || sharedBindings.size === 0) {
      return null
    }

    if (debug) {
      console.info('[bun code-splitter] Shared Module: ', id)
    }

    const result = compileCodeSplitSharedRoute({
      code,
      sharedBindings,
      filename: normalizedId,
    })
    if (debug) {
      logDiff(code, result.code)
    }
    return result
  }

  const transformReference = (code: string, id: string): string => {
    initUserConfig()
    if (!userConfig.autoCodeSplitting) {
      return code
    }
    const normalizedId = normalizePath(stripQuery(id))
    const generatorFileInfo =
      routerPluginContext.routesByFile.get(normalizedId)
    if (!generatorFileInfo) {
      return code
    }
    if (!matchesRouteFactory(code)) {
      return code
    }
    const result = handleCompilingReferenceFile(
      code,
      normalizedId,
      generatorFileInfo,
    )
    return result?.code ?? code
  }

  const transformVirtual = (code: string, id: string): string => {
    initUserConfig()
    if (!userConfig.autoCodeSplitting) {
      return code
    }
    if (id.includes(tsrSplit)) {
      // Ensure shared bindings exist (reference compile may not have run yet)
      const baseId = normalizePath(stripQuery(id))
      const generatorFileInfo =
        routerPluginContext.routesByFile.get(baseId)
      if (generatorFileInfo && matchesRouteFactory(code)) {
        handleCompilingReferenceFile(code, baseId, generatorFileInfo)
      }
      return handleCompilingVirtualFile(code, id).code
    }
    if (id.includes(tsrShared)) {
      return handleCompilingSharedFile(code, id)?.code ?? code
    }
    return code
  }

  const plugin: BunPlugin = {
    name: 'tanstack-router:code-splitter:bun',
    setup(build) {
      build.onStart(() => {
        initUserConfig()
      })

      const resolveQueryModule = (
        args: { path: string },
        kind: 'split' | 'shared',
      ) => {
        const marker = kind === 'split' ? tsrSplit : tsrShared
        if (!args.path.includes(marker)) {
          return undefined
        }
        const filePath = stripQuery(args.path)
        return {
          path: args.path.includes('?') ? args.path : `${filePath}?${marker}=1`,
          namespace: kind === 'split' ? 'tsr-split' : 'tsr-shared',
        }
      }

      build.onResolve({ filter: /tsr-split/ }, (args) =>
        resolveQueryModule(args, 'split'),
      )
      build.onResolve({ filter: /tsr-shared/ }, (args) =>
        resolveQueryModule(args, 'shared'),
      )
      build.onResolve({ filter: /^\// }, (args) => {
        if (args.path.includes(tsrSplit)) {
          return resolveQueryModule(args, 'split')
        }
        if (args.path.includes(tsrShared)) {
          return resolveQueryModule(args, 'shared')
        }
        return undefined
      })

      build.onLoad({ filter: /.*/, namespace: 'tsr-split' }, async (args) => {
        const filePath = stripQuery(args.path)
        const code = await readFile(filePath, 'utf8')
        const url = pathToFileURL(args.path)
        url.searchParams.delete('v')
        const normalizedId = normalizePath(fileURLToPath(url))
        const result = handleCompilingVirtualFile(code, normalizedId)
        return {
          contents: result.code,
          loader: loaderForPath(filePath),
        }
      })

      build.onLoad({ filter: /.*/, namespace: 'tsr-shared' }, async (args) => {
        const filePath = stripQuery(args.path)
        const code = await readFile(filePath, 'utf8')
        const result = handleCompilingSharedFile(code, args.path)
        if (!result) {
          return { contents: code, loader: loaderForPath(filePath) }
        }
        return {
          contents: result.code,
          loader: loaderForPath(filePath),
        }
      })
    },
  }

  return { plugin, transformReference, transformVirtual }
}

/**
 * Convenience: Bun plugin only (virtual modules). Prefer
 * {@link createBunRouterCodeSplitterRuntime} when composing with StartCompiler.
 */
export function createBunRouterCodeSplitterPlugin(
  routerPluginContext: RouterPluginContext,
  bunOptions: BunCodeSplitterOptions,
): BunPlugin {
  return createBunRouterCodeSplitterRuntime(routerPluginContext, bunOptions)
    .plugin
}
