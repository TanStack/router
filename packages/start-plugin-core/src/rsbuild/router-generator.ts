/**
 * The route generator session of Start's Rsbuild plugin (J1.10,
 * J2.15): one `Generator` per plugin, run as a precondition of
 * every environment compiler (`beforeRun`, `watchRun` with the compiler's
 * modified and removed files) and, in development, fed by its own watcher
 * for the files outside the bundle (created route files, `physical()`
 * mounts). It publishes the route registry the route planners read and
 * serves the client's route tree without its server-only routes.
 */
import path from 'node:path'
import {
  Generator,
  getConfig as getGeneratorConfig,
  watchRouteFiles,
} from '@tanstack/router-generator'
import {
  changedRoutePaths,
  createRouterPluginContext,
  onRoutesChanged,
} from '@tanstack/router-plugin/context'
import { RouteRegistryView } from '@tanstack/router-plugin/planners'
import { routesManifestPlugin } from '../start-router-plugin/generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from '../start-router-plugin/generator-plugins/prerender-routes-plugin'
import { buildRouteTreeFileFooterFromConfig } from '../start-router-plugin/route-tree-footer'
import { createClientRouteTree } from '../start-router-plugin/client-route-tree'
import type { GetConfigFn, TanStackStartCoreOptions } from '../types'
import type { TanStackStartRsbuildInputConfig } from './schema'
import type { RouteFileWatcher } from '@tanstack/router-generator'
import type { RouteRegistry } from '@tanstack/router-utils/compiler'

export interface RsbuildRouteGenerator {
  /** The route registry (a route file's entry by its scanned or real path). */
  routes: RouteRegistry
  /** A build's generation (every compiler awaits it). */
  beforeRun: () => Promise<void>
  /** A watch compilation: the compiler's file events, and the generator's own watcher from the first one. */
  watchRun: (
    modified: ReadonlyArray<string>,
    removed: ReadonlyArray<string>,
  ) => Promise<void>
  close: () => Promise<void>
  /** Route files whose registry entry changed (the compilers invalidate their plans). */
  onRoutesChanged: (listener: (files: Array<string>) => void) => void
  /** The client's route tree module. */
  clientRouteTree: {
    path: () => string
    code: () => Promise<string>
    /** Bumped when the pruned route set changes (the tree file may not). */
    version: () => number
  }
}

export function createRsbuildRouteGenerator(opts: {
  getConfig: GetConfigFn
  corePluginOpts: TanStackStartCoreOptions
  startPluginOpts: TanStackStartRsbuildInputConfig
  dev: boolean
}): RsbuildRouteGenerator {
  let generator: Generator | undefined
  // the published registry (the context dedupes an unchanged publication)
  const context = createRouterPluginContext()
  const registry = new RouteRegistryView(context)
  let watcher: Promise<RouteFileWatcher> | undefined
  let version = 0

  const treePath = () =>
    path.resolve(opts.getConfig().startConfig.router.generatedRouteTree)

  const clientRouteTree = createClientRouteTree({
    onClientRoutesChange: () => {
      version++
    },
  })

  const instance = (): Generator => {
    if (generator) {
      return generator
    }
    const { startConfig, resolvedStartConfig } = opts.getConfig()
    const root = resolvedStartConfig.root
    const config = getGeneratorConfig(
      {
        ...startConfig.router,
        routeTreeFileFooter: () =>
          buildRouteTreeFileFooterFromConfig({
            generatedRouteTreePath: treePath(),
            getConfig: opts.getConfig,
            corePluginOpts: opts.corePluginOpts,
          }),
        plugins: [
          clientRouteTree.plugin,
          routesManifestPlugin(),
          ...(opts.startPluginOpts.prerender?.enabled === true
            ? [prerenderRoutesPlugin()]
            : []),
          // (the app's own generator plugins run too, #7768)
          ...(startConfig.router.plugins ?? []),
        ],
      },
      root,
    )
    generator = new Generator({ config, root })
    return generator
  }

  const publish = () => {
    context.routesByFile = instance().getRoutesByFileMap()
  }

  const settle = async (run: Promise<void>) => {
    try {
      await run
    } catch (error) {
      console.error(error)
    }
    publish()
  }

  return {
    routes: registry,
    beforeRun: () => settle(instance().run()),
    async watchRun(modified, removed) {
      const gen = instance()
      if (opts.dev && !watcher) {
        watcher = watchRouteFiles(gen, (run) => void settle(run))
        await (
          await watcher
        ).ready
        await settle(gen.run())
        return
      }
      const runs: Array<Promise<void>> = []
      for (const file of modified) {
        runs.push(gen.run({ type: 'update', path: file }))
      }
      for (const file of removed) {
        runs.push(gen.run({ type: 'delete', path: file }))
      }
      if (runs.length === 0 && !opts.dev) {
        runs.push(gen.run())
      }
      await settle(Promise.all(runs).then(() => undefined))
    },
    async close() {
      const w = watcher
      watcher = undefined
      await (await w)?.close()
    },
    onRoutesChanged(listener) {
      onRoutesChanged(context, (next, previous) => {
        const changed = changedRoutePaths(next, previous)
        if (changed.length > 0) {
          listener(changed)
        }
      })
    },
    clientRouteTree: {
      path: treePath,
      code: () => clientRouteTree.code(),
      version: () => version,
    },
  }
}
