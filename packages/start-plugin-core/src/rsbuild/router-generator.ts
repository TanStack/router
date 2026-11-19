/**
 * The route generator of Start's Rsbuild plugin (J1.10, J2.15): one
 * `Generator` per plugin and its session (`createGeneratorSession`), run
 * once before a production build's environments compile (`build`; once per
 * environment compiler when a program runs the compiler itself), and as
 * a precondition of every watch compilation (`watchRun`, whose first one
 * starts the generator's own watcher for the files outside the bundle:
 * created route files, `physical()` mounts). It publishes the
 * route registry the router planner reads and serves the client's route
 * tree without its server-only routes.
 */
import path from 'node:path'
import { Generator, createGeneratorSession } from '@tanstack/router-generator'
import {
  changedRoutePaths,
  createRouterPluginContext,
  onRoutesChanged,
  publishRoutes,
} from '@tanstack/router-plugin/context'
import { RouteRegistryView } from '@tanstack/router-plugin/planners'
import { startGeneratorConfig } from '../start-router-plugin/generator-config'
import { createClientRouteTree } from '../start-router-plugin/client-route-tree'
import type { GetConfigFn, TanStackStartCoreOptions } from '../types'
import type { TanStackStartRsbuildInputConfig } from './schema'
import type { RouteRegistry } from '@tanstack/router-utils/compiler'

export interface RsbuildRouteGenerator {
  /** The route registry (a route file's entry by its scanned or real path). */
  routes: RouteRegistry
  /** A production build's generation, once for all its environments (Rsbuild's `onBeforeBuild`; without it, each compiler's `run`). */
  build: () => Promise<void>
  /** A watch compilation: the generator's own watcher from the first one, the compiler's file events after. */
  watchRun: (
    modified: ReadonlyArray<string>,
    removed: ReadonlyArray<string>,
  ) => Promise<void>
  close: () => Promise<void>
  /** Route files whose registry entry changed (the compilers invalidate their plans); gives the unsubscribe. */
  onRoutesChanged: (listener: (files: Array<string>) => void) => () => void
  /** The client's route tree module. */
  clientRouteTree: {
    path: () => string
    code: () => Promise<string>
    /**
     * Whether the tree module of the compilation may hold another pruned route
     * set than the current one: its routes changed since `code()` last served
     * it (the tree file may not), or nothing served it in this process (a
     * module restored from the persistent cache).
     */
    stale: () => boolean
    /** The pruned route set's version (bumped when it changes). */
    version: () => number
  }
}

export function createRsbuildRouteGenerator(opts: {
  getConfig: GetConfigFn
  corePluginOpts: TanStackStartCoreOptions
  startPluginOpts: TanStackStartRsbuildInputConfig
}): RsbuildRouteGenerator {
  let generator: Generator | undefined
  // the published registry (the context dedupes an unchanged publication)
  const context = createRouterPluginContext()
  const registry = new RouteRegistryView(context)
  /** Bumped when the pruned route set changes. */
  let version = 0
  /** The version of the last tree `code()` served (none yet: -1). */
  let served = -1

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
    generator = new Generator({
      config: startGeneratorConfig({
        getConfig: opts.getConfig,
        corePluginOpts: opts.corePluginOpts,
        prerender: opts.startPluginOpts.prerender?.enabled === true,
        clientRouteTree: clientRouteTree.plugin,
      }),
      root: opts.getConfig().resolvedStartConfig.root,
    })
    return generator
  }

  const session = createGeneratorSession({
    generator: instance,
    publish: (routesByFile, failure) => {
      publishRoutes(context, routesByFile, failure)
    },
  })

  return {
    routes: registry,
    build: () => session.build(),
    watchRun: (modified, removed) => session.watchRun(modified, removed),
    close: () => session.close(),
    onRoutesChanged(listener) {
      return onRoutesChanged(context, (next, previous) => {
        const changed = changedRoutePaths(next, previous)
        if (changed.length > 0) {
          listener(changed)
        }
      })
    },
    clientRouteTree: {
      path: treePath,
      code: async () => {
        const serving = version
        const code = await clientRouteTree.code()
        served = serving
        return code
      },
      stale: () => served !== version,
      version: () => version,
    },
  }
}
