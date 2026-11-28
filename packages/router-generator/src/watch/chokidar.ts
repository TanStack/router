import type { FileEventType, Generator } from '../generator'

export interface RouteFileWatcher {
  /**
   * Resolves `true` once the watcher has scanned its targets, or `false`
   * when it was closed first (a closed watcher never scans).
   */
  ready: Promise<boolean>
  /**
   * Watches the targets the generator's last run added (the `physical()`
   * mounts of the scan and the config it read): after every run, the first
   * one included.
   */
  refresh: () => void
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
 * deleted files, and follows the mounts as the config changes (SPEC J1.10):
 * the owner of the runs calls `refresh` after each one. Each event goes to
 * the current generator (`generator`: a host replaces it when its config
 * changes), whose targets `refresh` adds. `onRun` gets the run
 * of each event; `onError` each error of the watcher (a path it cannot watch:
 * the watcher keeps the others, and watches again what it can), which would
 * otherwise end the process.
 */
export async function watchRouteFiles(
  generator: () => Generator,
  onRun: (run: Promise<void>) => void,
  onError: (error: unknown) => void,
): Promise<RouteFileWatcher> {
  const chokidar = await import('chokidar')
  const watched = new Set<string>()
  const targets = () => {
    const { directories, files } = generator().watchTargets()
    return [...directories, ...files].filter((target) => !watched.has(target))
  }
  const initial = targets()
  initial.forEach((target) => watched.add(target))
  const watcher = chokidar.watch(initial, { ignoreInitial: true })
  watcher.on('error', onError)
  let closedFirst = () => {}
  const ready = new Promise<boolean>((resolve) => {
    watcher.once('ready', () => resolve(true))
    closedFirst = () => resolve(false)
  })

  watcher.on('all', (event, file) => {
    const type = eventTypes[event]
    if (!type) {
      return
    }
    onRun(generator().run({ type, path: file }))
  })

  return {
    ready,
    refresh() {
      const added = targets()
      if (added.length) {
        added.forEach((target) => watched.add(target))
        watcher.add(added)
      }
    },
    close: () => {
      closedFirst()
      return watcher.close()
    },
  }
}
