import type { FileEventType, Generator } from '../generator'

export interface RouteFileWatcher {
  /** Resolves once the watcher has scanned its targets. */
  ready: Promise<void>
  close: () => Promise<void>
}

const eventTypes: Record<string, FileEventType | undefined> = {
  add: 'create',
  change: 'update',
  unlink: 'delete',
}

/**
 * One file watcher for a generator (bundlers whose own watcher reports only
 * the files of the bundle: Rspack, webpack, the CLI). It watches every
 * root the routes come from (the routes directory, `physical()` mounts),
 * the route tree and the virtual route config file for created, changed and
 * deleted files, and follows the mounts as the config changes (SPEC J1.10).
 * `onRun` gets each run's outcome.
 */
export async function watchRouteFiles(
  generator: Generator,
  onRun: (run: Promise<void>) => void,
): Promise<RouteFileWatcher> {
  const chokidar = await import('chokidar')
  const watched = new Set<string>()
  const targets = () => {
    const { directories, files } = generator.watchTargets()
    return [...directories, ...files].filter((target) => !watched.has(target))
  }
  const initial = targets()
  initial.forEach((target) => watched.add(target))
  const watcher = chokidar.watch(initial, { ignoreInitial: true })
  const ready = new Promise<void>((resolve) => watcher.once('ready', resolve))

  watcher.on('all', (event, file) => {
    const type = eventTypes[event]
    if (!type) {
      return
    }
    const run = generator.run({ type, path: file })
    onRun(run)
    run.then(
      () => {
        const added = targets()
        if (added.length) {
          added.forEach((target) => watched.add(target))
          watcher.add(added)
        }
      },
      () => {},
    )
  })

  return {
    ready,
    close: () => watcher.close(),
  }
}
