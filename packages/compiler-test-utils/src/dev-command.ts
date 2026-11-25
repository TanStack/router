import { setCommandNodeEnv, withNodeEnv } from './node-env'

/**
 * Runs the process under `NODE_ENV=development`, as `vite dev` and
 * `rsbuild dev` run an app (each sets it when it is unset): Vitest's `test`
 * is not a dev server's environment. It stays set while the process's dev
 * servers run (the code they serve reads it on each request), but for the
 * builds of the process (`./node-env`); the test file's environment comes
 * back after the file (`./test-scope-setup`).
 *
 * With `start` (a dev server's start), `start` runs under it from start to
 * end: not while a build of the process runs under another value. Without,
 * the process only takes it up again (a server an earlier file started).
 */
export function runAsDevCommand(): void
export function runAsDevCommand<T>(start: () => Promise<T>): Promise<T>
export function runAsDevCommand<T>(start?: () => Promise<T>) {
  if (!start) {
    setCommandNodeEnv('development')
    return undefined
  }
  // (only once it holds: a start that cannot hold leaves the process as it
  // was)
  return withNodeEnv('development', () => {
    setCommandNodeEnv('development')
    return start()
  })
}
