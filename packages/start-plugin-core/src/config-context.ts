import {
  createNormalizedBasePaths,
  createNormalizedOutputDirectories,
  deriveRouterBasepath,
  resolveStartEntryPlan,
  resolveStartTestEntryPlan,
} from './planning'
import type { TanStackStartOutputConfig } from './schema'
import type {
  GetConfigFn,
  ResolvedStartConfig,
  TanStackStartCoreOptions,
} from './types'

export interface StartConfigContext {
  resolvedStartConfig: ResolvedStartConfig
  getConfig: GetConfigFn
  resolveEntries: () => ReturnType<typeof resolveStartEntryPlan>
  /**
   * The entries of a project under a test runner. The router entry is
   * optional there, see `isTestRun`.
   */
  resolveTestEntries: () => ReturnType<typeof resolveStartTestEntryPlan>
}

export function createStartConfigContext<TInputConfig>(opts: {
  corePluginOpts: TanStackStartCoreOptions
  startPluginOpts: TInputConfig | undefined
  parseConfig: (
    opts: TInputConfig | undefined,
    core: { framework: TanStackStartCoreOptions['framework'] },
    root: string,
  ) => TanStackStartOutputConfig
  /**
   * Whether the bundler runs for a test runner. `getConfig` then does not
   * require a router entry: `resolvedStartConfig.routerFilePath` is an empty
   * string when the project has none.
   */
  isTestRun?: () => boolean
}): StartConfigContext {
  const resolvedStartConfig: ResolvedStartConfig = {
    root: '',
    startFilePath: undefined,
    routerFilePath: '',
    srcDirectory: '',
    basePaths: {
      publicBase: '',
      assetBase: {
        dev: '',
        build: '',
      },
    },
    outputDirectories: {
      client: '',
      server: '',
    },
  }

  let startConfig: TanStackStartOutputConfig | null = null
  let resolvedEntryPlanCache:
    | ReturnType<typeof resolveStartEntryPlan>
    | undefined
  let resolvedTestEntryPlanCache:
    | ReturnType<typeof resolveStartTestEntryPlan>
    | undefined

  function requireRoot(): string {
    if (!resolvedStartConfig.root) {
      throw new Error(`Cannot get config before root is resolved`)
    }

    return resolvedStartConfig.root
  }

  function getStartConfig(): TanStackStartOutputConfig {
    if (!startConfig) {
      startConfig = opts.parseConfig(
        opts.startPluginOpts,
        { framework: opts.corePluginOpts.framework },
        requireRoot(),
      )
    }

    return startConfig
  }

  function getResolvedEntryPlan() {
    if (resolvedEntryPlanCache) {
      return resolvedEntryPlanCache
    }

    resolvedEntryPlanCache = resolveStartEntryPlan({
      root: requireRoot(),
      startConfig: getStartConfig(),
      defaultEntryPaths: opts.corePluginOpts.defaultEntryPaths,
    })

    Object.assign(resolvedStartConfig, {
      srcDirectory: resolvedEntryPlanCache.srcDirectory,
      startFilePath: resolvedEntryPlanCache.startFilePath,
      routerFilePath: resolvedEntryPlanCache.routerFilePath,
    })

    return resolvedEntryPlanCache
  }

  function getResolvedTestEntryPlan() {
    if (resolvedTestEntryPlanCache) {
      return resolvedTestEntryPlanCache
    }

    resolvedTestEntryPlanCache = resolveStartTestEntryPlan({
      root: requireRoot(),
      startConfig: getStartConfig(),
      defaultEntryPaths: opts.corePluginOpts.defaultEntryPaths,
    })

    Object.assign(resolvedStartConfig, {
      srcDirectory: resolvedTestEntryPlanCache.srcDirectory,
      startFilePath: resolvedTestEntryPlanCache.startFilePath,
      routerFilePath: resolvedTestEntryPlanCache.routerFilePath ?? '',
    })

    return resolvedTestEntryPlanCache
  }

  const getConfig: GetConfigFn = () => {
    const startConfig = getStartConfig()
    if (opts.isTestRun?.()) {
      getResolvedTestEntryPlan()
    } else {
      getResolvedEntryPlan()
    }

    return { startConfig, resolvedStartConfig }
  }

  function resolveEntries() {
    return getResolvedEntryPlan()
  }

  function resolveTestEntries() {
    return getResolvedTestEntryPlan()
  }

  return {
    resolvedStartConfig,
    getConfig,
    resolveEntries,
    resolveTestEntries,
  }
}

export function applyResolvedBaseAndOutput(opts: {
  resolvedStartConfig: ResolvedStartConfig
  root: string
  publicBase: string
  clientOutputDirectory: string
  serverOutputDirectory: string
}): void {
  opts.resolvedStartConfig.root = opts.root
  opts.resolvedStartConfig.basePaths = createNormalizedBasePaths({
    publicBase: opts.publicBase,
  })
  opts.resolvedStartConfig.outputDirectories =
    createNormalizedOutputDirectories({
      client: opts.clientOutputDirectory,
      server: opts.serverOutputDirectory,
    })
}

export function applyResolvedRouterBasepath(opts: {
  resolvedStartConfig: ResolvedStartConfig
  startConfig: TanStackStartOutputConfig
}): string {
  const routerBasepath = deriveRouterBasepath({
    configuredBasepath: opts.startConfig.router.basepath,
    publicBase: opts.resolvedStartConfig.basePaths.publicBase,
  })
  opts.startConfig.router.basepath = routerBasepath
  return routerBasepath
}
