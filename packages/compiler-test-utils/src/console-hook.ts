/**
 * The one hook on what the test process prints: `console.*` and direct
 * writes to `process.stdout` / `process.stderr`. Every capture of the
 * harness (`captureConsole`, the diagnostic channel of `./diagnostic-channel`,
 * the dev-server and build harnesses) reads through it, so captures nest and
 * overlap in any order without one restoring the console under another.
 *
 * Who receives what is printed:
 * - Printed in an async scope (`run()`, or `enter()` at a native callback
 *   boundary): the sinks of that scope only. Nested scopes inherit their
 *   parent captures; concurrent scopes stay separate.
 * - Printed outside any scope: a bundler calls plugin hooks from native
 *   code (Rolldown's hooks in a Vite build, Rspack's compiler and
 *   compilation hooks), where Node's async context is not propagated. What
 *   a compiler prints there is still reported (a "nothing reported" check
 *   reads every channel, SPEC §5.7), to the work it belongs to:
 *   1. the sinks that claimed an app root (`claim()`) the text names, with
 *      the captures they are nested in;
 *   2. else, when the open sinks are one line of nested work (one build or
 *      dev server in this worker, with the captures around it), all of them;
 *   3. else every open sink, with the entry marked `shared`: its owner is
 *      unknown, and concurrent work may receive another's output. A failure
 *      that reads it says so.
 *
 * Captured output is silenced (recorded only); with no sink, the hook is
 * removed and the originals are back. A hook a later patch wrapped (e.g. a
 * test's own `vi.spyOn`) is left in place and forwards to the originals
 * once no sink listens.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { realpathSync } from 'node:fs'
import { format } from 'node:util'

const activeSinks = new AsyncLocalStorage<ReadonlySet<Sink>>()

export type ConsoleMethod = 'error' | 'warn' | 'log' | 'info' | 'debug'

export const consoleMethods: ReadonlyArray<ConsoleMethod> = [
  'error',
  'warn',
  'log',
  'info',
  'debug',
]

export type PrintedEntry = (
  | { kind: 'console'; method: ConsoleMethod; args: Array<unknown> }
  | { kind: 'stream'; stream: 'stdout' | 'stderr'; text: string }
) & {
  /**
   * Printed outside any async scope with no way to tell whose work printed
   * it (rule 3 of the module comment): every open sink received it.
   */
  shared?: true
}

export interface Sink {
  /** Receives `console.*` calls. */
  console: boolean
  /** Receives direct writes to `process.stdout` / `process.stderr`. */
  streams: boolean
  receive: (entry: PrintedEntry) => void
}

interface SinkState {
  /** The sinks it was nested in when it started listening. */
  parents: ReadonlySet<Sink>
  /** The app roots it claimed (as given, and resolved). */
  roots: Set<string>
}

const sinks = new Map<Sink, SinkState>()

/** Whether `text` names `root`: the directory itself or a path in it. */
function names(text: string, root: string) {
  for (
    let at = text.indexOf(root);
    at !== -1;
    at = text.indexOf(root, at + 1)
  ) {
    if (!/[\w.-]/.test(text.charAt(at + root.length))) {
      return true
    }
  }
  return false
}

/** A sink and the captures it is nested in. */
function lineOf(sink: Sink) {
  return new Set([sink, ...(sinks.get(sink)?.parents ?? [])])
}

/**
 * The sinks that receive what is printed now (see the module comment), and
 * whether that is a guess (`shared`).
 */
function listeners(
  wants: (sink: Sink) => boolean,
  text: () => string,
): { listening: Array<Sink>; shared: boolean } {
  const scoped = activeSinks.getStore()
  const open = [...sinks.keys()].filter(wants)
  if (scoped !== undefined) {
    return { listening: open.filter((sink) => scoped.has(sink)), shared: false }
  }
  if (open.length <= 1) {
    return { listening: open, shared: false }
  }
  const printed = text()
  const owners = open.filter((sink) =>
    [...sinks.get(sink)!.roots].some((root) => names(printed, root)),
  )
  if (owners.length > 0) {
    const receiving = new Set(owners.flatMap((owner) => [...lineOf(owner)]))
    return {
      listening: open.filter((sink) => receiving.has(sink)),
      // Unrelated owners of one root (e.g. a dev server and a build of the
      // same app): either may have printed it
      shared: !owners.some((owner) =>
        owners.every((other) => lineOf(owner).has(other)),
      ),
    }
  }
  const innermost = open.find((sink) =>
    open.every((other) => lineOf(sink).has(other)),
  )
  return { listening: open, shared: innermost === undefined }
}

type ConsoleFunction = (...args: Array<unknown>) => void
type Write = typeof process.stdout.write

let originals:
  | {
      console: Record<ConsoleMethod, ConsoleFunction>
      stdout: Write
      stderr: Write
    }
  | undefined
let hooks:
  | {
      console: Record<ConsoleMethod, ConsoleFunction>
      stdout: Write
      stderr: Write
    }
  | undefined

function streamText(chunk: unknown) {
  return typeof chunk === 'string'
    ? chunk
    : chunk instanceof Uint8Array
      ? Buffer.from(chunk).toString('utf8')
      : String(chunk)
}

function install() {
  if (hooks) {
    return
  }
  const saved = {
    console: Object.fromEntries(
      consoleMethods.map((method) => [method, console[method]]),
    ) as Record<ConsoleMethod, ConsoleFunction>,
    stdout: process.stdout.write,
    stderr: process.stderr.write,
  }
  originals = saved
  const consoleHooks = Object.fromEntries(
    consoleMethods.map((method) => [
      method,
      (...args: Array<unknown>) => {
        const { listening, shared } = listeners(
          (sink) => sink.console,
          () => format(...args),
        )
        if (listening.length === 0) {
          saved.console[method].apply(console, args)
          return
        }
        for (const sink of listening) {
          sink.receive({
            kind: 'console',
            method,
            args,
            ...(shared && { shared }),
          })
        }
      },
    ]),
  ) as Record<ConsoleMethod, ConsoleFunction>
  const streamHook = (stream: 'stdout' | 'stderr'): Write =>
    function (this: unknown, chunk: unknown, ...rest: Array<unknown>) {
      const { listening, shared } = listeners(
        (sink) => sink.streams,
        () => streamText(chunk),
      )
      if (listening.length === 0) {
        return (saved[stream] as (...args: Array<unknown>) => boolean).call(
          process[stream],
          chunk,
          ...rest,
        )
      }
      const text = streamText(chunk)
      for (const sink of listening) {
        sink.receive({
          kind: 'stream',
          stream,
          text,
          ...(shared && { shared }),
        })
      }
      // Writes complete at once: call a callback given as the last argument
      const callback = rest.at(-1)
      if (typeof callback === 'function') {
        queueMicrotask(() => (callback as () => void)())
      }
      return true
    } as Write
  hooks = {
    console: consoleHooks,
    stdout: streamHook('stdout'),
    stderr: streamHook('stderr'),
  }
  for (const method of consoleMethods) {
    console[method] = consoleHooks[method]
  }
  process.stdout.write = hooks.stdout
  process.stderr.write = hooks.stderr
}

function uninstall() {
  if (!hooks || !originals) {
    return
  }
  // Only where the hook is still in place: a patch made over it keeps
  // calling it, and it forwards to the originals while no sink listens.
  for (const method of consoleMethods) {
    if (console[method] === hooks.console[method]) {
      console[method] = originals.console[method]
    }
  }
  if (process.stdout.write === hooks.stdout) {
    process.stdout.write = originals.stdout
  }
  if (process.stderr.write === hooks.stderr) {
    process.stderr.write = originals.stderr
  }
  hooks = undefined
  originals = undefined
}

export interface Listening {
  /** Stops the sink. */
  (): void
  /** Runs `run` in the sink's scope: it and its async descendants. */
  run: <T>(run: () => T) => T
  /**
   * Enters the sink's scope for the rest of the current synchronous work:
   * restores ownership at a native bundler callback boundary, where Node's
   * async context is not propagated.
   */
  enter: () => void
  /**
   * Claims an app root: what is printed outside any scope and names it (the
   * directory or a file in it) is this sink's (see the module comment).
   */
  claim: (root: string) => void
}

/** Installs a sink (see the module comment for what it receives). */
export function listen(sink: Sink): Listening {
  const parents = activeSinks.getStore() ?? new Set<Sink>()
  const state: SinkState = { parents, roots: new Set() }
  sinks.set(sink, state)
  install()
  const stop = () => {
    sinks.delete(sink)
    if (sinks.size === 0) {
      uninstall()
    }
  }
  return Object.assign(stop, {
    enter: () => activeSinks.enterWith(new Set([...parents, sink])),
    run: <T>(run: () => T): T =>
      activeSinks.run(new Set([...(activeSinks.getStore() ?? []), sink]), run),
    claim: (root: string) => {
      state.roots.add(root)
      try {
        state.roots.add(realpathSync(root))
      } catch {
        // Not on disk: the path as given
      }
    },
  })
}

/** Keep later API calls in the same async scope as server creation/watchers. */
export function scopeMethods<T extends object>(
  run: <TResult>(fn: () => TResult) => TResult,
  methods: T,
): T {
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(methods),
  )) {
    if (typeof descriptor.value === 'function') {
      const method = descriptor.value
      Object.defineProperty(methods, key, {
        ...descriptor,
        value: function (this: T, ...args: Array<unknown>) {
          return run(() => method.apply(this, args))
        },
      })
    }
  }
  return methods
}
