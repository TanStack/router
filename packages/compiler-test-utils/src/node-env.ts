/**
 * The test process's `NODE_ENV`, which the commands a test reproduces set:
 * `vite build` or `rsbuild build` run under the build's mode (`production`
 * by default), `vite dev` and `rsbuild dev` under `development`. Vitest's
 * workers start under `test`, and one worker may run several builds and dev
 * servers, of one test or of concurrent ones, while `process.env` is the
 * process's alone. So it has one owner here:
 *
 * - `withNodeEnv(value, run)`: `run` (a build) runs under `value`
 *   (`null`: unset) from start to end. Builds under the same value run at
 *   once; one under another value waits until they ended. When the last
 *   ends, the value from before the first is back (a build command's
 *   process ends with the build; a tool's own change of it, e.g. `vite
 *   build` setting it when it is unset, ends with the build too).
 * - `setCommandNodeEnv(value)`: the process runs as a command that sets it
 *   (`runAsDevCommand` of `./dev-command`): at once, or once the running
 *   builds ended.
 *
 * A dev server of the worker that serves while a build of another value
 * runs reads the build's value meanwhile (Vite reads `NODE_ENV` per client
 * transform): a build and a dev server of different values are not run at
 * once by the projects that share a worker between tests.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

/** The value of the builds running now, and how many. */
let held: { value: string | null; count: number } | undefined
/** The value to restore once no build runs. */
let outside: string | undefined
/** Builds waiting for the running ones to end. */
const waiting: Array<() => void> = []
/** The value of the build an async scope belongs to. */
const scope = new AsyncLocalStorage<string | null>()

function apply(value: string | null | undefined) {
  if (value === null || value === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = value
  }
}

/** Runs `run` under `NODE_ENV=value` (`null`: unset); see the module comment. */
export async function withNodeEnv<T>(
  value: string | null,
  run: () => Promise<T>,
): Promise<T> {
  const enclosing = scope.getStore()
  if (enclosing !== undefined && enclosing !== value) {
    throw new Error(
      `a build under NODE_ENV=${String(enclosing)} started one under NODE_ENV=${String(value)}: one process runs one value at a time`,
    )
  }
  while (held !== undefined && held.value !== value) {
    await new Promise<void>((resolve) => waiting.push(resolve))
  }
  if (held === undefined) {
    outside = process.env.NODE_ENV
    held = { value, count: 0 }
    apply(value)
  }
  held.count++
  try {
    return await scope.run(value, run)
  } finally {
    held.count--
    if (held.count === 0) {
      held = undefined
      apply(outside)
      for (const wake of waiting.splice(0)) {
        wake()
      }
    }
  }
}

/**
 * Sets `NODE_ENV` as a command the process runs as sets it: at once, or,
 * while builds run, once they ended.
 */
export function setCommandNodeEnv(value: string) {
  if (held === undefined) {
    apply(value)
  } else {
    outside = value
  }
}
