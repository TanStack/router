/**
 * The route generator session of Start's Rsbuild plugin (DESIGN §4.6,
 * J1.10, J2.15): one `Generator` per plugin, run as a precondition of
 * every environment compiler (`beforeRun`, `watchRun` with the compiler's
 * modified and removed files) and, in development, fed by its own watcher
 * for the files outside the bundle (created route files, `physical()`
 * mounts). It publishes the route registry the route planners read and
 * serves the client's route tree without its server-only routes.
 */
import { realpathSync } from 'node:fs'
import path from 'node:path'
import {
  Generator,
  getConfig as getGeneratorConfig,
  watchRouteFiles,
} from '@tanstack/router-generator'
import { routesManifestPlugin } from '../start-router-plugin/generator-plugins/routes-manifest-plugin'
import { prerenderRoutesPlugin } from '../start-router-plugin/generator-plugins/prerender-routes-plugin'
import { buildRouteTreeFileFooterFromConfig } from '../start-router-plugin/route-tree-footer'
import { createClientRouteTree } from '../start-router-plugin/client-route-tree'
import { normalizePath } from '../utils'
import type { GetConfigFn, TanStackStartCoreOptions } from '../types'
import type { TanStackStartRsbuildInputConfig } from './schema'
import type {
  GetRoutesByFileMapResult,
  RouteFileWatcher,
} from '@tanstack/router-generator'

export interface RsbuildRouteGenerator {
  /** The registry entry of a route file (its scanned or real path). */
  lookup: (file: string) => { routeId: string } | null
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
  let routesByFile: GetRoutesByFileMapResult = new Map()
  let byRealPath: Map<string, { routeId: string }> | null = null
  let watcher: Promise<RouteFileWatcher> | undefined
  let version = 0
  const listeners = new Set<(files: Array<string>) => void>()

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
        ],
      },
      root,
    )
    generator = new Generator({ config, root })
    return generator
  }

  const publish = () => {
    const previous = routesByFile
    routesByFile = instance().getRoutesByFileMap()
    byRealPath = null
    const changed: Array<string> = []
    for (const [file, entry] of routesByFile) {
      if (previous.get(file)?.routeId !== entry.routeId) {
        changed.push(file)
      }
    }
    for (const file of previous.keys()) {
      if (!routesByFile.has(file)) {
        changed.push(file)
      }
    }
    if (changed.length > 0) {
      for (const listener of listeners) {
        listener(changed)
      }
    }
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
    lookup(file) {
      const p = normalizePath(file)
      const entry = routesByFile.get(p)
      if (entry) {
        return { routeId: entry.routeId }
      }
      if (!byRealPath) {
        // bundlers resolve a symlinked route file to its real path
        byRealPath = new Map()
        for (const [scanned, e] of routesByFile) {
          try {
            const real = normalizePath(realpathSync.native(scanned))
            if (real !== scanned && !routesByFile.has(real)) {
              byRealPath.set(real, { routeId: e.routeId })
            }
          } catch {
            // gone
          }
        }
      }
      return byRealPath.get(p) ?? null
    },
    beforeRun: () => settle(instance().run()),
    async watchRun(modified, removed) {
      const gen = instance()
      if (opts.dev && !watcher) {
        watcher = watchRouteFiles(gen, (run) => void settle(run))
        await (await watcher).ready
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
      listeners.add(listener)
    },
    clientRouteTree: {
      path: treePath,
      code: () => clientRouteTree.code(),
      version: () => version,
    },
  }
}
