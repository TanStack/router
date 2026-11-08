/**
 * Compile diagnostics of the webpack-family loaders at their positions
 * (router and Start). The bundlers print a compilation error's or warning's
 * module and `loc` (webpack `WARNING in ./src/a.ts 3:5`, Rsbuild
 * `File: ./src/a.ts:3:5`, terminal and overlay; `:1:1` without), and keep
 * no location of a loader's thrown error or emitted warning or error. So a
 * loader records each diagnostic with its position in the module's
 * `buildInfo` (fresh per build, kept for a failed module), and the host
 * replaces what the loader reported with errors and warnings located there
 * after the seal (`locateDiagnostics`). The bundler prints that position, so
 * the message carries none (one position per message, 1-based).
 */
import type { DiagnosticPosition } from '../diagnostics'

export interface LocatedDiagnostic {
  severity: 'error' | 'warning'
  /** The reported message (the loader's error or warning has this text). */
  message: string
  /** 1-based line and column. */
  line?: number
  column?: number
}

/** How a host's loader reports, and where it records, its diagnostics. */
export interface LocatedDiagnosticsOptions {
  /** The `buildInfo` field holding a module's records, in the order reported. */
  field: string
  /** The `name` of a located error and of a located warning. */
  errorName: string
  warningName: string
  /**
   * The name in the message of the error a loader throws for all of a
   * module's errors at once (the module fails): it is replaced by one
   * located error per recorded error. Without it, each reported error is
   * matched to its record as a warning is.
   */
  failureName?: string
}

/** What the helpers use of a webpack / Rspack module. */
export interface LocatedModuleLike {
  buildInfo?: Record<string, unknown>
  identifier: () => string
}

/** What the helpers use of a compilation's error or warning. */
interface ReportedLike {
  message: string
  module?: unknown
}

type ErrorClass = new (message: string) => Error

/** A diagnostic's record: its message and its 1-based position. */
export function locatedDiagnostic(
  severity: LocatedDiagnostic['severity'],
  message: string,
  at: DiagnosticPosition | undefined,
): LocatedDiagnostic {
  return at
    ? { severity, message, line: at.line, column: at.column + 1 }
    : { severity, message }
}

/**
 * A compilation's errors and warnings of its modules' recorded diagnostics,
 * replaced in place by ones located at their positions.
 */
export function locateDiagnostics(
  compilation: { errors: Array<unknown>; warnings: Array<unknown> },
  WebpackError: ErrorClass,
  options: LocatedDiagnosticsOptions,
): void {
  for (const severity of ['error', 'warning'] as const) {
    const list = (
      severity === 'error' ? compilation.errors : compilation.warnings
    ) as Array<ReportedLike>
    /** The records of each module not yet located, in the order reported. */
    const pending = new Map<string, Array<LocatedDiagnostic>>()
    for (let i = list.length - 1; i >= 0; i--) {
      const reported = list[i]!
      const module = reported.module as LocatedModuleLike | undefined
      const records = module?.buildInfo?.[options.field] as
        | Array<LocatedDiagnostic>
        | undefined
      if (!module || !records) {
        continue
      }
      const id = module.identifier()
      let left = pending.get(id)
      if (!left) {
        left = records.filter((d) => d.severity === severity)
        pending.set(id, left)
      }
      if (
        severity === 'error' &&
        options.failureName !== undefined &&
        reported.message.includes(options.failureName)
      ) {
        if (left.length > 0) {
          list.splice(
            i,
            1,
            ...left
              .splice(0)
              .map((d) => locatedError(WebpackError, module, d, options)),
          )
        }
        continue
      }
      // walking backwards: the module's last diagnostic not yet located
      const last = left.at(-1)
      if (last && reported.message.includes(firstLine(last.message))) {
        list.splice(
          i,
          1,
          locatedError(WebpackError, module, left.pop()!, options),
        )
      }
    }
  }
}

/** A compile diagnostic of `module` as a bundler error or warning at its position. */
export function locatedError(
  WebpackError: ErrorClass,
  module: LocatedModuleLike,
  d: LocatedDiagnostic,
  options: Pick<LocatedDiagnosticsOptions, 'errorName' | 'warningName'>,
): Error {
  const error = new WebpackError(d.message) as Error & {
    module?: unknown
    loc?: { start: { line: number; column?: number } }
  }
  error.name = d.severity === 'error' ? options.errorName : options.warningName
  error.module = module
  if (d.line !== undefined) {
    error.loc = { start: { line: d.line, column: d.column } }
  }
  return error
}

/** The start of a message's first line, as the bundler's message quotes it. */
const firstLine = (message: string) => message.split('\n', 1)[0]!.slice(0, 60)
