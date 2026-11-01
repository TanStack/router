/**
 * One diagnostic channel (SPEC §5.7, G5):
 * everything a user would see reported while a piece of work runs, merged,
 * in order, whatever way a compiler or a tool reports it:
 * - `console.*` (`error`, `warn`; `log`, `info`, `debug` as `info`);
 * - direct writes to `process.stderr` (`warning`) and `process.stdout`
 *   (`info`);
 * - Vite's logger (`viteLogger()`: `warn`/`warnOnce` as `warning`, `error`
 *   with the error object it carries, `info` as `info`);
 * - a bundler compilation's errors and warnings (`reportCompilation()`:
 *   Rspack, webpack, Rsbuild), each recorded once, from the compilation;
 * - a tool's own logger (`reportLogged()`, e.g. Rsbuild's: source
 *   `rsbuild`), except what only prints a compilation report again;
 * - anything else a harness reads (`report()`), e.g. a page's console.
 *
 * SPEC §5.7 frees the channel: a compiler may warn through `console.warn`,
 * Vite's logger or the bundler's compilation. So an assertion that something
 * is reported reads every channel, and so does one that nothing is: "nothing
 * reported" is `expectNoProblems(channel.diagnostics)` (no `warning` and no
 * `error`; `info` is not a problem).
 *
 * Scoping: a channel records its `run()` work and async descendants until
 * `close()`, and what is printed outside any async scope (from a bundler's
 * native callbacks) when it is the channel's: it names an app root the
 * channel claimed (`claim()`), or no other work is open (`./console-hook`).
 * Output whose owner is unknown goes to every open channel, marked `shared`.
 * `mark()` / `since(mark)` slice what a step (an edit, a build) reported, and
 * `scope(run)` records exactly what `run` reported. Channels may overlap
 * (nested captures, or concurrent tests in one file): each receives what is
 * printed by their own work; concurrent scopes do not share output.
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
   * `bundler`. Call it when the compile ends, before the tool prints its
   * own summary of it (Rspack: a `done` tap of an early stage), so that
   * `reportLogged()` recognises the summary.
   */
  reportCompilation: (compilation: {
    errors?: Iterable<unknown>
    warnings?: Iterable<unknown>
  }) => void
  /**
   * Records what a tool's logger printed (e.g. Rsbuild's `customLogger`)
   * under `source`, unless it only prints again a compilation report this
   * channel recorded: the report's messages (Rsbuild's "Build errors: …"),
   * or, while the compile that failed ends, a status line naming nothing
   * ("build failed in 0.12s"). Each report is then recorded once, from the
   * compilation; anything else the logger prints is recorded.
   */
  reportLogged: (
    message: unknown,
    args: Array<unknown>,
    severity: Severity,
    source: DiagnosticSource,
  ) => void
  /** Records any captured value (`diagnosticsOf`) under `source`. */
  report: (value: unknown, severity: Severity, source: DiagnosticSource) => void
  /** Called with each diagnostic as it is recorded. */
  onDiagnostic: (listener: (diagnostic: ChannelDiagnostic) => void) => void
  /** Runs work in this channel; descendants (watchers, requests) inherit it. */
  run: <T>(run: () => T) => T
  /**
   * Claims an app root: what is printed outside any async scope (a
   * bundler's native callbacks) and names it is this channel's.
   */
  claim: (root: string) => void
  /** Restore this app’s scope at Rspack’s native-to-JS loader boundary. */
  scopeRspack: (compiler: Rspack.Compiler) => void
  /** Stops recording (idempotent). */
  close: () => void
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
  const shared = entry.shared && { shared: entry.shared }
  if (entry.kind === 'console') {
    return {
      severity: consoleSeverities[entry.method],
      text: consoleText(entry.args),
      raw: entry.args,
      source: 'console',
      ...shared,
    }
  }
  return {
    severity: entry.stream === 'stderr' ? 'warning' : 'info',
    text: stripVTControlCharacters(entry.text).replace(/\r?\n$/, ''),
    raw: entry.text,
    source: entry.stream,
    ...shared,
  }
}

/** Lines without colours, indentation or blank lines, for comparison. */
function contentOf(text: string) {
  return stripVTControlCharacters(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n')
}

/**
 * What a tool printing a compilation's error or warning again would quote:
 * its message (a tool may leave out the nested errors after webpack's
 * `-- inner error --`).
 */
function quotedOf(item: unknown) {
  const message =
    typeof item === 'string'
      ? item
      : typeof (item as { message?: unknown } | null)?.message === 'string'
        ? (item as { message: string }).message
        : undefined
  return message === undefined
    ? ''
    : contentOf(message.split('-- inner error --')[0]!)
}

/** Opens a channel for run()/scope() work, recording until close(). */
export function openDiagnosticChannel(): DiagnosticChannel {
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
  const stop = listen({
    console: true,
    streams: true,
    receive: (entry) => push(printedDiagnostic(entry)),
  })
  /** The messages of the compilation reports recorded (`quotedOf`). */
  const compiled: Array<string> = []
  /**
   * Whether a compile that failed is ending now (its errors were recorded
   * in this turn of the event loop): the tool's status line follows.
   */
  let failing = false

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
    claim: stop.claim,
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
      const errors = [...(compilation.errors ?? [])]
      const warnings = [...(compilation.warnings ?? [])]
      report(errors, 'error', 'bundler')
      report(warnings, 'warning', 'bundler')
      for (const item of [...errors, ...warnings]) {
        const quoted = quotedOf(item)
        if (quoted !== '') {
          compiled.push(quoted)
        }
      }
      if (errors.length > 0 && !failing) {
        failing = true
        setImmediate(() => {
          failing = false
        })
      }
    },
    reportLogged: (message, args, severity, source) => {
      const printed = [message, ...args]
      const content = contentOf(consoleText(printed))
      const reprint =
        (severity === 'error' || severity === 'warning') &&
        // The report's messages, each from the start of a line
        (compiled.some((quoted) => `\n${content}`.includes(`\n${quoted}`)) ||
          (severity === 'error' &&
            failing &&
            !content.includes('\n') &&
            !/[\\/]/.test(content)))
      if (reprint) {
        return
      }
      if (args.length === 0) {
        report(message, severity, source)
      } else {
        push({ severity, text: consoleText(printed), raw: printed, source })
      }
    },
    report,
    onDiagnostic: (listener) => {
      listeners.push(listener)
    },
    close: () => {
      if (!closed) {
        closed = true
        stop()
        // A plugin holding the channel's logger may outlive the build (Vite 8
        // keeps every plugin it was given): it keeps no listener's scope
        listeners.length = 0
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
): Promise<{ result: T; diagnostics: Array<ChannelDiagnostic> }> {
  const channel = openDiagnosticChannel()
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
 * the "nothing reported" check. `info` output is allowed. The failure
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
            `  [${diagnostic.source ?? 'unknown'} ${diagnostic.severity}${diagnostic.shared ? ', printed outside any scope by work of unknown owner' : ''}] ${diagnostic.text.replace(/\n/g, '\n    ')}`,
        )
        .join('\n')}`,
    )
  }
}
