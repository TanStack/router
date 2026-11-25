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
 *   `value` (`null`: unset) from start to end. `holdNodeEnv(value, start)`
 *   holds it from `start` on until the release it returns is called (a
 *   preview server, which reads it per request), or gives it back when
 *   `start` fails.
 * - One rule decides when a hold starts. A hold of the value that holds now
 *   starts at once, whoever asks: it may be work the holder waits for, from
 *   a callback outside its async scope. `null` is the exception: a tool may
 *   set the value while it runs (`vite build` sets `production` when it is
 *   unset), so an unset build asked outside another's scope waits. A hold of
 *   another value waits, in the order asked, until every hold ended, and
 *   for at most `nodeEnvWaitLimit`: past it, it rejects naming what holds
 *   the value, and never starts (also when the holder ends later than its
 *   timer could run). So a build that never ends, a hold of another value
 *   asked by work the holder waits for, or holds of the running value one
 *   after another for that long fail the waiter loudly at the limit.
 * - A hold asked inside `run` joins it: under the same value it runs under
 *   its own (an unset build inside an unset build whose tool set the value
 *   sees it unset), and the value from before it is back after it; under
 *   another value it throws (it would wait for itself). When the last hold
 *   ends, the value from before the first is back.
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
  /** A hold asked inside another's `run`: the value to put back after it. */
  restore?: { value: string | undefined }
}

interface Waiting {
  value: string | null
  /** When it stops waiting. */
  deadline: number
  grant: (hold: Hold) => void
  expire: () => void
}

/** The holds running now, of one value, and since when. */
let held: { value: string | null; holds: Set<Hold>; since: number } | undefined
/** The value to restore once nothing holds. */
let outside: string | undefined
/** The holds waiting, in the order asked. */
const queue: Array<Waiting> = []
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
  if (hold.restore) {
    apply(hold.restore.value)
  }
  held!.holds.delete(hold)
  if (held!.holds.size > 0) {
    return
  }
  held = undefined
  apply(outside)
  // The first waiter still within its limit starts, with every waiter of
  // its value (they would start at once if asked now)
  let next: Waiting | undefined
  while ((next = queue.shift())) {
    if (Date.now() > next.deadline) {
      next.expire()
      continue
    }
    next.grant(begin(next.value))
    const value = next.value
    for (const waiting of value === null
      ? []
      : queue.filter((other) => other.value === value)) {
      queue.splice(queue.indexOf(waiting), 1)
      if (Date.now() > waiting.deadline) {
        waiting.expire()
      } else {
        waiting.grant(join())
      }
    }
    return
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
    // Under its own value, whatever a tool of the enclosing one set
    const hold = join()
    hold.restore = { value: process.env.NODE_ENV }
    apply(value)
    return hold
  }
  if (held === undefined) {
    return begin(value)
  }
  if (held.value === value && value !== null) {
    return join()
  }
  return new Promise<Hold>((resolve, reject) => {
    const waiting: Waiting = {
      value,
      deadline: Date.now() + nodeEnvWaitLimit,
      grant: (hold) => {
        clearTimeout(timer)
        resolve(hold)
      },
      expire: () => {
        clearTimeout(timer)
        reject(
          new Error(
            `NODE_ENV=${String(value)} waited ${nodeEnvWaitLimit} ms for NODE_ENV=${String(held?.value)}, held by ${held?.holds.size ?? 0} build(s) or server(s) since ${held ? Date.now() - held.since : 0} ms ago: one that never ended, one waiting for work of this one, or holds of that value one after another`,
          ),
        )
      },
    }
    const timer = setTimeout(() => {
      queue.splice(queue.indexOf(waiting), 1)
      waiting.expire()
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
 * Holds `NODE_ENV=value` from `start` (a server's start) on, until the
 * returned release is called; gives it back when `start` fails (see the
 * module comment).
 */
export async function holdNodeEnv<T>(
  value: string,
  start: () => Promise<T>,
): Promise<{ result: T; release: () => void }> {
  const hold = await acquire(value)
  try {
    const result = await scope.run(hold, start)
    return { result, release: () => release(hold) }
  } catch (error) {
    release(hold)
    throw error
  }
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
