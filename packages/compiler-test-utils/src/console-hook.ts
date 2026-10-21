/**
 * The one hook on what the test process prints: `console.*` and direct
 * writes to `process.stdout` / `process.stderr`. Every capture of the
 * harness (`captureConsole`, the diagnostic channel of `./diagnostic-channel`,
 * the dev-server and build harnesses) reads through it, so captures nest and
 * overlap in any order without one restoring the console under another.
 *
 * While at least one sink listens, what it listens to is silenced (recorded
 * only); with none, the hook is removed and the originals are back. A hook a
 * later patch wrapped (e.g. a test's own `vi.spyOn`) is left in place and
 * forwards to the originals once no sink listens.
 */
export type ConsoleMethod = 'error' | 'warn' | 'log' | 'info' | 'debug'

export const consoleMethods: ReadonlyArray<ConsoleMethod> = [
  'error',
  'warn',
  'log',
  'info',
  'debug',
]

export type PrintedEntry =
  | { kind: 'console'; method: ConsoleMethod; args: Array<unknown> }
  | { kind: 'stream'; stream: 'stdout' | 'stderr'; text: string }

export interface Sink {
  /** Receives `console.*` calls. */
  console: boolean
  /** Receives direct writes to `process.stdout` / `process.stderr`. */
  streams: boolean
  receive: (entry: PrintedEntry) => void
}

const sinks = new Set<Sink>()

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
        const listening = [...sinks].filter((sink) => sink.console)
        if (listening.length === 0) {
          saved.console[method].apply(console, args)
          return
        }
        for (const sink of listening) {
          sink.receive({ kind: 'console', method, args })
        }
      },
    ]),
  ) as Record<ConsoleMethod, ConsoleFunction>
  const streamHook = (stream: 'stdout' | 'stderr'): Write =>
    function (this: unknown, chunk: unknown, ...rest: Array<unknown>) {
      const listening = [...sinks].filter((sink) => sink.streams)
      if (listening.length === 0) {
        return (saved[stream] as (...args: Array<unknown>) => boolean).call(
          process[stream],
          chunk,
          ...rest,
        )
      }
      const text = streamText(chunk)
      for (const sink of listening) {
        sink.receive({ kind: 'stream', stream, text })
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

/**
 * Starts delivering what is printed to `sink`; returns the function that
 * stops it (the hook goes once no sink listens).
 */
export function listen(sink: Sink): () => void {
  sinks.add(sink)
  install()
  return () => {
    sinks.delete(sink)
    if (sinks.size === 0) {
      uninstall()
    }
  }
}
