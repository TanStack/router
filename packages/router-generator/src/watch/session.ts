import { watchRouteFiles } from './chokidar'
import type { RouteFileWatcher } from './chokidar'
import type { Generator, GeneratorEvent } from '../generator'
import type { GetRoutesByFileMapResult } from '../types'

export interface GeneratorSession {
  /** One run (a build, or a file event a host's own watcher reports), then the registry is handed over. */
  run: (event?: GeneratorEvent) => Promise<void>
  /**
   * Watches the route files with the generator's own watcher (every route
   * file event, the bundle's or not: created files, `physical()` mounts,
   * the virtual route config), then, once it is ready, runs: an event of
   * the meantime is not lost. Concurrent calls share the first.
   */
  watch: () => Promise<void>
  /**
   * A watch compilation of a bundler (`watchRun`): the first one watches
   * (`watch`); every later one hands the generator the compiler's modified
   * and removed files and waits for their run, so the compilation sees what
   * its own events generate (the own watcher reports them too: a file read
   * again unchanged is no change).
   */
  watchRun: (
    modified: Iterable<string>,
    removed: Iterable<string>,
  ) => Promise<void>
  /** Stops watching; `watch` starts again with the current generator. */
  close: () => Promise<void>
}

/**
 * One generator session of a bundler plugin or the CLI: when the generator
 * runs and what it hands over. A run's failure is reported (`report`,
 * default `console.error`); `publish` gets the registry after every run (it
 * changes only when a batch published its route tree: a failed one leaves
 * the previous registry).
 */
export function createGeneratorSession(opts: {
  /** The current generator (a host replaces it when its config file changes). */
  generator: () => Generator
  publish?: (routesByFile: GetRoutesByFileMapResult) => void
  report?: (error: unknown) => void
}): GeneratorSession {
  const report = opts.report ?? ((error: unknown) => console.error(error))
  let watcher: Promise<RouteFileWatcher> | undefined
  let watching: Promise<void> | undefined

  const settle = async (run: Promise<void>) => {
    try {
      await run
    } catch (error) {
      report(error)
    }
    opts.publish?.(opts.generator().getRoutesByFileMap())
  }

  const session: GeneratorSession = {
    run: (event) => settle(opts.generator().run(event)),
    watch() {
      watching ??= (async () => {
        watcher = watchRouteFiles(opts.generator(), (run) => void settle(run))
        await (
          await watcher
        ).ready
        await session.run()
      })()
      return watching
    },
    async watchRun(modified, removed) {
      if (!watching) {
        return session.watch()
      }
      await watching
      const generator = opts.generator()
      const runs: Array<Promise<void>> = []
      for (const path of modified) {
        runs.push(generator.run({ type: 'update', path }))
      }
      for (const path of removed) {
        runs.push(generator.run({ type: 'delete', path }))
      }
      if (runs.length > 0) {
        await settle(Promise.all(runs).then(() => undefined))
      }
    },
    async close() {
      const w = watcher
      watcher = undefined
      watching = undefined
      await (await w)?.close()
    },
  }
  return session
}
