import { Generator } from '@tanstack/router-generator'
import { getConfig } from '@tanstack/router-plugin'
import { createBunRouterCodeSplitterRuntime } from '@tanstack/router-plugin/bun'
import { createRouterPluginContext } from '@tanstack/router-plugin/context'
import { routesManifestPlugin } from '../start-router-plugin/generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from '../start-router-plugin/generator-plugins/prerender-routes-plugin'
import type { Config, RouterPluginContext } from '@tanstack/router-plugin'
import type { BunCodeSplitterRuntime } from '@tanstack/router-plugin/bun'
import type { CompileStartFrameworkOptions } from '../types'
import type { BunPlugin } from 'bun'

export interface BunRouterSession {
  context: RouterPluginContext
  generate: () => Promise<Generator>
  /** Virtual-module Bun plugin (`tsr-split` / `tsr-shared`). */
  createCodeSplitterPlugin: (env: 'client' | 'server') => BunPlugin
  /**
   * Reference-route transform to run inside the StartCompiler onLoad
   * (Bun allows only one successful onLoad per module).
   */
  getCodeSplitterRuntime: (env: 'client' | 'server') => BunCodeSplitterRuntime
}

/**
 * Shared Generator + code-splitter session for the Start Bun adapter.
 * Generator populates `context.routesByFile` consumed by the Bun code-splitter.
 */
export function createBunRouterSession(opts: {
  root: string
  framework: CompileStartFrameworkOptions
  routerConfig?: Partial<Config>
  prerenderEnabled?: boolean
  isProduction: boolean
}): BunRouterSession {
  const context = createRouterPluginContext()
  const runtimes = new Map<'client' | 'server', BunCodeSplitterRuntime>()

  const generate = async () => {
    const config = getConfig(
      {
        ...opts.routerConfig,
        // Bun previously always ran the splitter; default on for React parity.
        // Solid/Vue examples may set `autoCodeSplitting: false` until virtual
        // split modules also run framework JSX transforms.
        autoCodeSplitting: opts.routerConfig?.autoCodeSplitting ?? true,
        target: opts.framework,
        plugins: [
          routesManifestPlugin(),
          ...(opts.prerenderEnabled === true ? [prerenderRoutesPlugin()] : []),
          ...((opts.routerConfig?.plugins as Array<unknown> | undefined) ??
            []),
        ],
      } as Partial<Config>,
      opts.root,
    )
    const generator = new Generator({
      config,
      root: opts.root,
    })
    await generator.run()
    context.routesByFile = generator.getRoutesByFileMap()
    return generator
  }

  const getCodeSplitterRuntime = (
    env: 'client' | 'server',
  ): BunCodeSplitterRuntime => {
    const cached = runtimes.get(env)
    if (cached) {
      return cached
    }
    const isClient = env === 'client'
    const runtime = createBunRouterCodeSplitterRuntime(context, {
      root: opts.root,
      isProduction: opts.isProduction,
      config: () =>
        getConfig(
          {
            ...opts.routerConfig,
            autoCodeSplitting: opts.routerConfig?.autoCodeSplitting ?? true,
            target: opts.framework,
            codeSplittingOptions: {
              ...opts.routerConfig?.codeSplittingOptions,
              deleteNodes: isClient
                ? ['ssr', 'server', 'headers']
                : opts.routerConfig?.codeSplittingOptions?.deleteNodes,
              addHmr: isClient && !opts.isProduction,
            },
            plugin: {
              ...opts.routerConfig?.plugin,
              hmr: {
                style: 'vite',
                ...opts.routerConfig?.plugin?.hmr,
              },
            },
          } as Partial<Config>,
          opts.root,
        ),
    })
    runtimes.set(env, runtime)
    return runtime
  }

  return {
    context,
    generate,
    getCodeSplitterRuntime,
    createCodeSplitterPlugin: (env) => getCodeSplitterRuntime(env).plugin,
  }
}

/**
 * @deprecated Prefer {@link createBunRouterSession}.
 */
export async function runBunRouterGenerator(opts: {
  root: string
  routerConfig?: Partial<Config>
}): Promise<Generator> {
  const session = createBunRouterSession({
    root: opts.root,
    framework: 'react',
    routerConfig: opts.routerConfig,
    isProduction: true,
  })
  return session.generate()
}
