/**
 * One diagnostic channel (SPEC §5.7, G5; RULES-AUDIT R18; coupling N15–N17):
 * everything a user would see reported while a piece of work runs, merged,
 * in order, whatever way a compiler or a tool reports it:
 * - `console.*` (`error`, `warn`; `log`, `info`, `debug` as `info`);
 * - direct writes to `process.stderr` (`warning`) and `process.stdout`
 *   (`info`);
 * - Vite's logger (`viteLogger()`: `warn`/`warnOnce` as `warning`, `error`
 *   with the error object it carries, `info` as `info`);
 * - a bundler compilation's errors and warnings (`reportCompilation()`:
 *   Rspack, webpack, Rsbuild);
 * - anything else a harness reads (`report()`), e.g. a page's console.
 *
 * SPEC §5.7 frees the channel: a compiler may warn through `console.warn`,
 * Vite's logger or the bundler's compilation. So an assertion that something
 * is reported reads every channel, and so does one that nothing is: "nothing
 * reported" is `expectNoProblems(channel.diagnostics)` (no `warning` and no
 * `error`; `info` is not a problem, N15).
 *
 * Scoping: a channel records its `run()` work and async descendants until
 * `close()`;
 * `mark()` / `since(mark)` slice what a step (an edit, a build) reported, and
 * `scope(run)` records exactly what `run` reported. Channels may overlap
 * (nested captures, or concurrent tests in one file): each receives what is
 * printed by their own async work; concurrent scopes do not share output.
 *
 * Every entry is a `Diagnostic` of `./diagnostics` with its `source`, so the
 * content matchers (`expectDiagnostic`, `findDiagnostics`) read it as they
 * read any other diagnostic.
 */
import { formatWithOptions, stripVTControlCharacters } from 'node:util'
import { listen } from './console-hook'
import { describeError, diagnosticsOf } from './diagnostics'
import type { ConsoleMethod, PrintedEntry } from './console-hook'
import type { Diagnostic, DiagnosticSource, Severity } from './diagnostics'
import type { LogErrorOptions, Logger } from 'vite'
import type { Rspack } from '@rsbuild/core'

export type { DiagnosticSource } from './diagnostics'

/** A diagnostic of a channel: always says where it came from. */
export type ChannelDiagnostic = Diagnostic & { source: DiagnosticSource }

export interface DiagnosticChannel {
  /** Everything reported while the channel was open, in order. */
  readonly diagnostics: Array<ChannelDiagnostic>
  /** The position after the last diagnostic, for `since()`. */
  mark: () => number
  /** What was reported after `mark` (a value of `mark()`). */
  since: (mark: number) => Array<ChannelDiagnostic>
  /** Runs `run`, and returns its result and what was reported meanwhile. */
  scope: <T>(
    run: () => T | Promise<T>,
  ) => Promise<{ result: T; diagnostics: Array<ChannelDiagnostic> }>
  /**
   * A Vite `customLogger` feeding the channel (source `vite`). Vite's own
   * informational output (`info`) is recorded with severity `info`.
   */
  viteLogger: () => Logger
  /**
   * Records a bundler compilation's errors and warnings (Rspack, webpack;
   * a compilation, its stats JSON, or any `{ errors, warnings }`), source
   * `bundler`.
   */
  reportCompilation: (compilation: {
    errors?: Iterable<unknown>
    warnings?: Iterable<unknown>
  }) => void
  /** Records any captured value (`diagnosticsOf`) under `source`. */
  report: (value: unknown, severity: Severity, source: DiagnosticSource) => void
  /** Called with each diagnostic as it is recorded. */
  onDiagnostic: (listener: (diagnostic: ChannelDiagnostic) => void) => void
  /** Runs work in this channel; descendants (watchers, requests) inherit it. */
  run: <T>(run: () => T) => T
  /** Restore this app’s scope at Rspack’s native-to-JS loader boundary. */
  scopeRspack: (compiler: Rspack.Compiler) => void
  /** Stops recording (idempotent). */
  close: () => void
}

export interface DiagnosticChannelOptions {
  /** Records `console.*` (default `true`). */
  console?: boolean
  /** Records direct writes to `process.stdout`/`stderr` (default `true`). */
  streams?: boolean
}

const consoleSeverities: Record<ConsoleMethod, Severity> = {
  error: 'error',
  warn: 'warning',
  log: 'info',
  info: 'info',
  debug: 'info',
}

/** The text of `console.*` arguments, as the console would print them. */
export function consoleText(args: Array<unknown>) {
  return stripVTControlCharacters(
    args
      .map((arg) =>
        arg instanceof Error
          ? describeError(arg)
          : typeof arg === 'string'
            ? arg
            : formatWithOptions({ colors: false }, '%o', arg),
      )
      .join(' '),
  )
}

/** A printed entry as a diagnostic. */
export function printedDiagnostic(entry: PrintedEntry): ChannelDiagnostic {
  if (entry.kind === 'console') {
    return {
      severity: consoleSeverities[entry.method],
      text: consoleText(entry.args),
      raw: entry.args,
      source: 'console',
    }
  }
  return {
    severity: entry.stream === 'stderr' ? 'warning' : 'info',
    text: stripVTControlCharacters(entry.text).replace(/\r?\n$/, ''),
    raw: entry.text,
    source: entry.stream,
  }
}

/** Opens a channel for run()/scope() work, recording until close(). */
export function openDiagnosticChannel(
  options: DiagnosticChannelOptions = {},
): DiagnosticChannel {
  const diagnostics: Array<ChannelDiagnostic> = []
  const listeners: Array<(diagnostic: ChannelDiagnostic) => void> = []
  let closed = false
  const push = (diagnostic: ChannelDiagnostic) => {
    if (closed) {
      return
    }
    diagnostics.push(diagnostic)
    for (const listener of listeners) {
      listener(diagnostic)
    }
  }
  const recordsConsole = options.console ?? true
  const recordsStreams = options.streams ?? true
  const stop =
    recordsConsole || recordsStreams
      ? listen({
          console: recordsConsole,
          streams: recordsStreams,
          receive: (entry) => push(printedDiagnostic(entry)),
        })
      : Object.assign(() => {}, {
          run: <T>(run: () => T) => run(),
          enter: () => {},
        })

  const report = (
    value: unknown,
    severity: Severity,
    source: DiagnosticSource,
  ) => {
    for (const diagnostic of diagnosticsOf(value, severity)) {
      push({ ...diagnostic, source })
    }
  }

  const channel: DiagnosticChannel = {
    diagnostics,
    run: stop.run,
    scopeRspack: (compiler) => {
      const name = 'diagnostic-channel:loader-scope'
      compiler.hooks.compilation.tap(name, (compilation) => {
        compiler.webpack.NormalModule.getCompilationHooks(
          compilation,
        ).loader.tap(name, stop.enter)
      })
    },
    mark: () => diagnostics.length,
    since: (mark) => diagnostics.slice(mark),
    scope: async (run) => {
      const from = diagnostics.length
      const result = await stop.run(run)
      return { result, diagnostics: diagnostics.slice(from) }
    },
    viteLogger: () => {
      const warned = new Set<string>()
      const logger: Logger = {
        hasWarned: false,
        info: (message) => report(message, 'info', 'vite'),
        warn: (message) => {
          logger.hasWarned = true
          report(message, 'warning', 'vite')
        },
        warnOnce: (message) => {
          if (!warned.has(message)) {
            warned.add(message)
            logger.warn(message)
          }
        },
        // The error object Vite passes carries the structured location
        error: (message: unknown, errorOptions?: LogErrorOptions) => {
          const error = errorOptions?.error ?? message
          report(
            error instanceof Error || typeof error === 'object'
              ? error
              : message,
            'error',
            'vite',
          )
        },
        clearScreen: () => {},
        hasErrorLogged: () => false,
      }
      return logger
    },
    reportCompilation: (compilation) => {
      report([...(compilation.errors ?? [])], 'error', 'bundler')
      report([...(compilation.warnings ?? [])], 'warning', 'bundler')
    },
    report,
    onDiagnostic: (listener) => {
      listeners.push(listener)
    },
    close: () => {
      if (!closed) {
        closed = true
        stop()
      }
    },
  }
  return channel
}

/**
 * Runs `run` with a channel open and returns its result and everything
 * reported meanwhile. `channel` receives the channel first, e.g. to give a
 * dev server its Vite logger.
 */
export async function captureDiagnostics<T>(
  run: (channel: DiagnosticChannel) => T | Promise<T>,
  options: DiagnosticChannelOptions = {},
): Promise<{ result: T; diagnostics: Array<ChannelDiagnostic> }> {
  const channel = openDiagnosticChannel(options)
  try {
    const result = await channel.run(() => run(channel))
    return { result, diagnostics: [...channel.diagnostics] }
  } finally {
    channel.close()
  }
}

/** The diagnostics that are problems: severity `warning` or `error`. */
export function problems<T extends Diagnostic>(diagnostics: Array<T>) {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.severity === 'warning' || diagnostic.severity === 'error',
  )
}

/**
 * Asserts that no channel reported a problem (a `warning` or an `error`):
 * the "nothing reported" check. `info` output is allowed (N15). The failure
 * lists every problem with its source.
 */
export function expectNoProblems(
  diagnostics: Array<Diagnostic>,
  message = 'nothing reported',
) {
  const found = problems(diagnostics)
  if (found.length > 0) {
    throw new Error(
      `${message}: expected no warning or error on any channel, got ${found.length}:\n${found
        .map(
          (diagnostic) =>
            `  [${diagnostic.source ?? 'unknown'} ${diagnostic.severity}] ${diagnostic.text.replace(/\n/g, '\n    ')}`,
        )
        .join('\n')}`,
    )
  }
}
