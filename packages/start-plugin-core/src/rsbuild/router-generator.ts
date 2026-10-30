/**
 * The route generator of Start's Rsbuild plugin (J1.10, J2.15): one
 * `Generator` per plugin and its session (`createGeneratorSession`), run as
 * a precondition of every environment compiler (`beforeRun`; `watchRun`,
 * whose first one starts the generator's own watcher for the files outside
 * the bundle: created route files, `physical()` mounts). It publishes the
 * route registry the router planner reads and serves the client's route
 * tree without its server-only routes.
 */
import path from 'node:path'
import { Generator, createGeneratorSession } from '@tanstack/router-generator'
import {
  changedRoutePaths,
  createRouterPluginContext,
  onRoutesChanged,
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
  /** A build's generation (every compiler awaits it). */
  beforeRun: () => Promise<void>
  /** A watch compilation: the generator's own watcher from the first one, the compiler's file events after. */
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
}): RsbuildRouteGenerator {
  let generator: Generator | undefined
  // the published registry (the context dedupes an unchanged publication)
  const context = createRouterPluginContext()
  const registry = new RouteRegistryView(context)
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
    publish: (routesByFile) => {
      context.routesByFile = routesByFile
    },
  })

  return {
    routes: registry,
    beforeRun: () => session.run(),
    watchRun: (modified, removed) => session.watchRun(modified, removed),
    close: () => session.close(),
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
