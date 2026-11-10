import type { Rolldown } from 'vite'

/**
 * `vite build --watch`: the client's rebuild a file event started, from the
 * client watcher's `watchChange` until that rebuild's bundle is written or
 * it failed (the watcher's `BUNDLE_END` or `ERROR`). The server environment
 * rebuilds at the same time, and its modules that read the client's build
 * wait for it: the server-fn resolver (the functions the client references)
 * and the start manifest (the client's chunks). Only a followed watcher
 * (Start's own `buildApp`) is waited for.
 */
export class ClientRebuild {
  private following = false
  private current: { ended: Promise<void>; end: () => void } | null = null

  /**
   * Follows the client's watcher of a build run (Start's `buildApp`): each
   * rebuild ends with its bundle event. A rebuild an earlier run's watcher
   * left open (closed before its bundle) is not this run's.
   */
  follow(watcher: Rolldown.RolldownWatcher): void {
    this.current?.end()
    this.current = null
    this.following = true
    watcher.on('event', (event) => {
      if (event.code === 'BUNDLE_END' || event.code === 'ERROR') {
        this.current?.end()
        this.current = null
      }
    })
  }

  /** A file event of the client's watcher: a rebuild follows. */
  begin(): void {
    if (this.following && !this.current) {
      let end!: () => void
      const ended = new Promise<void>((resolve) => (end = resolve))
      this.current = { ended, end }
    }
  }

  /** The running rebuild's end, or undefined when none runs. */
  ended(): Promise<void> | undefined {
    return this.current?.ended
  }
}
