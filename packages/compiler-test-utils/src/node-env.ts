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
 * - Two holds share the process when `shareable`: the same value, not
 *   `null` (a tool may set the value while an unset build runs: `vite build`
 *   sets `production`). A hold that can share with the running ones starts
 *   at once, whoever asks: it may be work the holder waits for, from a
 *   callback outside its async scope. Any other waits, in the order asked,
 *   until every hold ended, for at most `nodeEnvWaitLimit`: then it rejects
 *   naming what holds the value, and never starts. So a build that never
 *   ends, a hold of another value asked by work the holder waits for, or
 *   shareable holds one after another for that long fail the waiter loudly.
 *   Every change (a hold asked, ended, a waiter's limit) goes through one
 *   `drain()`, which ends the waiters past their limit before it grants.
 * - A hold asked inside `run` joins it when it can share, and throws
 *   otherwise (it would wait for itself): an unset build inside another
 *   build throws too. When the last hold ends, the value from before the
 *   first is back.
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

interface Waiting {
  value: string | null
  /** When it stops waiting. */
  deadline: number
  /** Whether its timer ran (a clock can lag a timer, and the reverse). */
  expired: boolean
  grant: (hold: Hold) => void
  fail: (error: Error) => void
}

/** Whether two holds can run at once. */
const shareable = (a: string | null, b: string | null) => a !== null && a === b

/** `NODE_ENV=value`, as messages name it. */
const named = (value: string | null) =>
  value === null ? 'NODE_ENV (unset)' : `NODE_ENV=${value}`

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

/**
 * The one transition: ends the waiters past their limit (naming the holds
 * that kept them waiting, `ending` among them), ends `ending`, then grants
 * the first waiter when nothing holds, and every waiter that can share with
 * what holds.
 */
function drain(ending?: Hold) {
  const now = Date.now()
  for (const waiting of [...queue]) {
    if (waiting.expired || now >= waiting.deadline) {
      queue.splice(queue.indexOf(waiting), 1)
      waiting.fail(
        new Error(
          `${named(waiting.value)} waited ${nodeEnvWaitLimit} ms for ${held ? named(held.value) : 'nothing'}, held by ${held?.holds.size ?? 0} build(s) or server(s) since ${held ? now - held.since : 0} ms ago: one that never ended, one waiting for work of this one, or shareable ones one after another`,
        ),
      )
    }
  }
  if (ending?.active) {
    ending.active = false
    held!.holds.delete(ending)
    if (held!.holds.size === 0) {
      held = undefined
      apply(outside)
    }
  }
  if (!held && queue.length > 0) {
    const first = queue.shift()!
    outside = process.env.NODE_ENV
    held = { value: first.value, holds: new Set(), since: now }
    apply(first.value)
    first.grant(join())
  }
  for (const waiting of [...queue]) {
    if (held && shareable(held.value, waiting.value)) {
      queue.splice(queue.indexOf(waiting), 1)
      waiting.grant(join())
    }
  }
}

function acquire(value: string | null): Promise<Hold> {
  const enclosing = scope.getStore()
  if (enclosing?.active) {
    if (!shareable(enclosing.value, value)) {
      return Promise.reject(
        new Error(
          `a build under ${named(enclosing.value)} started one under ${named(value)}: they cannot share the process, and it would wait for itself`,
        ),
      )
    }
    return Promise.resolve(join())
  }
  return new Promise<Hold>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const waiting: Waiting = {
      value,
      deadline: Date.now() + nodeEnvWaitLimit,
      expired: false,
      grant: (hold) => {
        clearTimeout(timer)
        resolve(hold)
      },
      fail: (error) => {
        clearTimeout(timer)
        reject(error)
      },
    }
    queue.push(waiting)
    drain()
    if (queue.includes(waiting)) {
      timer = setTimeout(() => {
        waiting.expired = true
        drain()
      }, nodeEnvWaitLimit)
    }
  })
}

function release(hold: Hold) {
  drain(hold)
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
