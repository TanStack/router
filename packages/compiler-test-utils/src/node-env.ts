/**
 * The test process's `NODE_ENV`, which the commands a test reproduces set:
 * `vite build` or `rsbuild build` run under the build's mode (`production`
 * by default), `vite dev` and `rsbuild dev` under `development`, `vite
 * preview` under `production`. Vitest's workers start under `test`, and one
 * worker may run several builds, dev servers and preview servers, of one
 * test or of concurrent ones, while `process.env` is the process's alone.
 * So it has one owner here, and every write of the harness goes through it:
 *
 * - `withNodeEnv(value, run)`: `run` (a build, a server's start) runs under
 *   `value` (`null`: unset) from start to end. `holdNodeEnv(value)` holds it
 *   until the release it returns is called (a preview server, which reads
 *   it per request). Holds of the same value run at once, but for `null`: a
 *   tool may set it while it runs (`vite build` sets `production` when it is
 *   unset), so each unset build runs alone. A hold of another value waits,
 *   in the order asked (a hold of the running value asked later waits
 *   behind it); one asked inside `run` joins at once, or throws when its
 *   value differs (it would wait for itself). A wait longer than
 *   `nodeEnvWaitLimit` rejects, naming what holds the value meanwhile: a
 *   build that never ends, or a hold asked outside `run`'s async scope by
 *   work `run` waits for. When the last hold ends, the value from before
 *   the first is back.
 * - `setCommandNodeEnv(value)`: the process runs as a command that sets it
 *   (`runAsDevCommand` of `./dev-command`; `undefined` unsets it): at once,
 *   or once the running holds ended.
 *
 * What reads it after a hold ended does not see that hold's value: a Vite
 * dev server keeps the value it started under for its client code
 * (`./dev-server`), but its SSR code (the module runner, Node externals)
 * and Vite's dependency optimizer (a dependency discovered after the
 * server's start is bundled with the process's value then) read the
 * process's. So a dev server of a worker that serves or discovers while a
 * build of another value runs reads the build's value.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

/** How long a hold of `NODE_ENV` waits for the running ones, at most. */
export const nodeEnvWaitLimit = 20_000

interface Hold {
  value: string | null
  /** Whether it still holds (`run` may have left callbacks behind). */
  active: boolean
}

/** The holds running now, of one value, and since when. */
let held: { value: string | null; holds: Set<Hold>; since: number } | undefined
/** The value to restore once nothing holds. */
let outside: string | undefined
/** The holds waiting, in the order asked. */
const queue: Array<{ value: string | null; grant: (hold: Hold) => void }> = []
/** The hold whose `run` an async scope belongs to. */
const scope = new AsyncLocalStorage<Hold>()

function apply(value: string | null | undefined) {
  if (value === null || value === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = value
  }
}

/** A hold of the running value (`held`). */
function join(): Hold {
  const hold: Hold = { value: held!.value, active: true }
  held!.holds.add(hold)
  return hold
}

function begin(value: string | null): Hold {
  outside = process.env.NODE_ENV
  held = { value, holds: new Set(), since: Date.now() }
  apply(value)
  return join()
}

function release(hold: Hold) {
  if (!hold.active) {
    return
  }
  hold.active = false
  held!.holds.delete(hold)
  if (held!.holds.size > 0) {
    return
  }
  held = undefined
  apply(outside)
  const next = queue.shift()
  if (next) {
    next.grant(begin(next.value))
    // The holds of the same value asked right after it, with it
    while (next.value !== null && queue[0]?.value === next.value) {
      queue.shift()!.grant(join())
    }
  }
}

async function acquire(value: string | null): Promise<Hold> {
  const enclosing = scope.getStore()
  if (enclosing?.active) {
    if (enclosing.value !== value) {
      throw new Error(
        `a build under NODE_ENV=${String(enclosing.value)} started one under NODE_ENV=${String(value)}: one process runs one value at a time`,
      )
    }
    return join()
  }
  if (held === undefined) {
    return begin(value)
  }
  if (held.value === value && value !== null && queue.length === 0) {
    return join()
  }
  return new Promise<Hold>((resolve, reject) => {
    const waiting = {
      value,
      grant: (hold: Hold) => {
        clearTimeout(timer)
        resolve(hold)
      },
    }
    const timer = setTimeout(() => {
      queue.splice(queue.indexOf(waiting), 1)
      reject(
        new Error(
          `NODE_ENV=${String(value)} waited ${nodeEnvWaitLimit} ms for NODE_ENV=${String(held?.value)}, held by ${held?.holds.size ?? 0} build(s) or server(s) since ${held ? Date.now() - held.since : 0} ms ago: one that never ended, or one waiting for work of this one`,
        ),
      )
    }, nodeEnvWaitLimit)
    queue.push(waiting)
  })
}

/** Runs `run` under `NODE_ENV=value` (`null`: unset); see the module comment. */
export async function withNodeEnv<T>(
  value: string | null,
  run: () => Promise<T>,
): Promise<T> {
  const hold = await acquire(value)
  try {
    return await scope.run(hold, run)
  } finally {
    release(hold)
  }
}

/**
 * Holds `NODE_ENV=value` until the returned release is called (see the
 * module comment).
 */
export async function holdNodeEnv(value: string): Promise<() => void> {
  const hold = await acquire(value)
  return () => release(hold)
}

/**
 * Sets `NODE_ENV` as a command the process runs as sets it (`undefined`
 * unsets it): at once, or, while holds run, once they ended.
 */
export function setCommandNodeEnv(value: string | undefined) {
  if (held === undefined) {
    apply(value)
  } else {
    outside = value
  }
}
