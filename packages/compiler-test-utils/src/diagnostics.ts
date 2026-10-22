/**
 * What a user is told about a problem (SPEC G5, J2.8, §5.7; ruling
 * 2026-10-22: diagnostics are checked by file and position only).
 *
 * Tests capture what the user sees (a thrown or rejected error, a bundler's
 * errors and warnings, console output; every channel at once:
 * `./diagnostic-channel`) and assert only that a problem was reported, with
 * its severity where the spec gives one, naming the file and the position.
 * Never the wording, the code frame, the channel or the path spelling
 * beyond "absolute or project-relative".
 *
 * - `diagnosticsOf(value, severity?)`: the diagnostics a captured value
 *   carries: an error (one diagnostic, including the errors it aggregates,
 *   plus one per warning it carries), a build result or stats object without
 *   a message (one per error and per warning), a message object, a string,
 *   or an array.
 * - `captureThrow(run)`: the diagnostics of what `run` throws or rejects
 *   with; fails when it completes.
 * - `captureConsole(run)`: what `run` logs through `console`, by severity.
 * - `findDiagnostics(diagnostics, expectation)` and
 *   `expectDiagnostic(diagnostics, expectation)`: the diagnostics meeting
 *   an expectation; the latter fails unless one (or exactly `times`) does.
 *   Unless an expectation asks for `info`, only a `warning` or an `error`
 *   meets it (DECISIONS 2026-10-21).
 * - `mentionsFile(text, file, { root })`: the text holds the file's absolute
 *   path, or its project-relative path as a whole path.
 * - `diagnosticPosition(source, needle)`: the 1-based line and column of
 *   the first occurrence of `needle` in `source`.
 */
import path from 'node:path'
import { realpathSync } from 'node:fs'
import { inspect, stripVTControlCharacters } from 'node:util'
import { expect } from 'vitest'
import { listen } from './console-hook'

export type Severity = 'error' | 'warning' | 'info'

/** The channel a diagnostic was reported on (`./diagnostic-channel`). */
export type DiagnosticSource =
  | 'console'
  | 'stdout'
  | 'stderr'
  | 'vite'
  | 'rsbuild'
  | 'bundler'
  | 'page'
  | 'thrown'

/** One message a user sees. */
export interface Diagnostic {
  severity: Severity
  /**
   * Everything the user reads, ANSI colours removed: the message, a code
   * frame, and the structured fields some tools carry (Rollup's `id`,
   * `loc`, `frame`), printed as `file:line:column` (1-based column).
   */
  text: string
  /** The captured value this diagnostic comes from. */
  raw: unknown
  /** The channel it was reported on, when a channel recorded it. */
  source?: DiagnosticSource
  /**
   * Printed outside any async scope (a bundler's native callback) by work
   * the harness could not tell apart: every open capture received it, so it
   * may be another concurrent test's (`./console-hook`).
   */
  shared?: true
}

export interface DiagnosticExpectation {
  /**
   * Accepted severities. Default: `warning` or `error` (an `info` line
   * reports nothing, N15).
   */
  severity?: Severity | Array<Severity>
  /** The file the diagnostic must name: absolute, or relative to `root`. */
  file?: string
  /** The project root `file` is relative to. */
  root?: string
  /**
   * The position the diagnostic must report, in the original source:
   * 1-based line and, when given, column (`line:column`, with a 1-based or
   * 0-based column); without a column, `file:line`, `line:column` or a code
   * frame's highlighted line.
   */
  position?: { line: number; column?: number }
  /** How many diagnostics must match (default: at least one). */
  times?: number
}

/** The diagnostics a captured value carries. */
export function diagnosticsOf(
  value: unknown,
  severity: Severity = 'error',
): Array<Diagnostic> {
  if (value === undefined || value === null) {
    return []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => diagnosticsOf(item, severity))
  }
  // Already a diagnostic (e.g. a `BuildError`'s warnings): its own severity
  if (isDiagnostic(value)) {
    return [value]
  }
  if (typeof value === 'string') {
    return [{ severity, text: stripVTControlCharacters(value), raw: value }]
  }
  if (typeof value !== 'object') {
    return [{ severity, text: String(value), raw: value }]
  }
  const record = value as Record<string, unknown>
  const errors = Array.isArray(record.errors) ? record.errors : []
  const warnings = Array.isArray(record.warnings) ? record.warnings : []
  if (!hasMessage(record) && (errors.length > 0 || warnings.length > 0)) {
    // A build result or stats: its errors and warnings are the diagnostics.
    return [
      ...diagnosticsOf(errors, 'error'),
      ...diagnosticsOf(warnings, 'warning'),
    ]
  }
  // An error (with the errors it aggregates, e.g. a `BuildError` or an
  // esbuild failure, read as one) and the warnings it carries.
  return [
    {
      severity,
      text: describe(record),
      raw: value,
    },
    ...diagnosticsOf(warnings, 'warning'),
  ]
}

/**
 * The text a user reads of an error object: its message, frame, structured
 * location (1-based column), aggregated errors and cause (see `Diagnostic`).
 */
export function describeError(error: object): string {
  return describe(error as Record<string, unknown>)
}

function hasMessage(record: Record<string, unknown>) {
  return typeof record.message === 'string' || typeof record.text === 'string'
}

/**
 * The text of an error or a warning object: its message, its frame, the
 * file and location fields tools add (Rollup/Vite `id`/`loc`/`frame`,
 * esbuild `text`/`location`, Oxc `codeframe`, webpack `moduleName`/`loc`),
 * the errors it aggregates and its cause.
 */
function describe(record: Record<string, unknown>, depth = 0): string {
  const lines: Array<string> = []
  const message = [record.message, record.text].find(
    (candidate): candidate is string => typeof candidate === 'string',
  )
  if (message !== undefined) {
    lines.push(message)
  } else if (!(record instanceof Error)) {
    lines.push(inspect(record, { depth: 3 }))
  }
  for (const frame of [record.frame, record.codeframe]) {
    if (typeof frame === 'string') {
      lines.push(frame)
    }
  }
  const loc = (record.loc ?? record.location) as
    | { file?: unknown; line?: unknown; column?: unknown }
    | string
    | undefined
  const file = [
    typeof loc === 'object' ? loc.file : undefined,
    record.id,
    record.file,
    record.moduleName,
  ].find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate !== '',
  )
  if (typeof loc === 'object' && typeof loc.line === 'number') {
    // Rollup, Vite, Babel and esbuild locations have 0-based columns.
    const column = typeof loc.column === 'number' ? `:${loc.column + 1}` : ''
    lines.push(`${file ?? ''}:${loc.line}${column}`)
  } else if (typeof loc === 'string') {
    // webpack: `line:column-column`.
    lines.push(`${file ?? ''} ${loc}`)
  } else if (file !== undefined) {
    lines.push(file)
  }
  if (depth < 3) {
    for (const nested of [
      ...(Array.isArray(record.errors) ? record.errors : []),
      record.cause,
    ]) {
      if (typeof nested === 'string') {
        lines.push(nested)
      } else if (nested && typeof nested === 'object') {
        lines.push(describe(nested as Record<string, unknown>, depth + 1))
      }
    }
  }
  return stripVTControlCharacters(lines.join('\n'))
}

/**
 * The diagnostics of what `run` throws or rejects with. Fails when `run`
 * completes.
 */
export async function captureThrow(
  run: () => unknown,
): Promise<Array<Diagnostic>> {
  let result: unknown
  try {
    result = await run()
  } catch (error) {
    return diagnosticsOf(error, 'error')
  }
  throw new Error(
    `expected a throw or a rejection, got ${inspect(result, { depth: 2 })}`,
  )
}

/**
 * Runs `run` and collects what it logs through `console` (silenced), as
 * diagnostics (`error`; `warn` is `warning`; `log`/`info`/`debug` are
 * `info`). The console is restored afterwards, also when `run` throws.
 * Captures may overlap and nest with every other capture of the harness
 * (the shared hook of `./console-hook`): each gets its own async work,
 * including nested captures. The console is restored when the last one ends.
 *
 * This reads the console only. A check that a compiler reports something,
 * or that nothing is reported, reads every channel instead
 * (`captureDiagnostics` of `./diagnostic-channel`, SPEC §5.7).
 */
export async function captureConsole<T>(
  run: () => T | Promise<T>,
): Promise<{ result: T; diagnostics: Array<Diagnostic> }> {
  const { printedDiagnostic } = await import('./diagnostic-channel')
  const diagnostics: Array<Diagnostic> = []
  const stop = listen({
    console: true,
    streams: false,
    receive: (entry) => {
      const { source: _source, ...diagnostic } = printedDiagnostic(entry)
      diagnostics.push(diagnostic)
    },
  })
  try {
    return { result: await stop.run(run), diagnostics }
  } finally {
    stop()
  }
}

/** Why `diagnostic` does not meet `expected` (empty when it does). */
export function mismatches(
  diagnostic: Diagnostic,
  expected: DiagnosticExpectation,
): Array<string> {
  const reasons: Array<string> = []
  const severities = ([] as Array<Severity>).concat(
    expected.severity ?? ['warning', 'error'],
  )
  if (!severities.includes(diagnostic.severity)) {
    reasons.push(
      `severity ${diagnostic.severity}, expected ${severities.join(' or ')}`,
    )
  }
  if (
    expected.file !== undefined &&
    !mentionsFile(diagnostic.text, expected.file, expected)
  ) {
    reasons.push(`does not name ${expected.file}`)
  }
  if (
    expected.position !== undefined &&
    !reportsPosition(diagnostic.text, expected.position)
  ) {
    const { line, column } = expected.position
    reasons.push(
      `does not report ${line}${column === undefined ? '' : `:${column}`}`,
    )
  }
  return reasons
}

/**
 * The diagnostics that meet `expected` (its `times` is ignored). `captured`
 * is diagnostics, or any value `diagnosticsOf` reads (an error, warnings).
 */
export function findDiagnostics(
  captured: unknown,
  expected: DiagnosticExpectation,
): Array<Diagnostic> {
  return toDiagnostics(captured).filter(
    (diagnostic) => mismatches(diagnostic, expected).length === 0,
  )
}

function isDiagnostic(value: unknown): value is Diagnostic {
  return (
    typeof value === 'object' &&
    value !== null &&
    'severity' in value &&
    'raw' in value &&
    typeof (value as Diagnostic).text === 'string'
  )
}

/**
 * Diagnostics as given, or the diagnostics a captured value carries
 * (`diagnosticsOf`).
 */
function toDiagnostics(captured: unknown): Array<Diagnostic> {
  if (isDiagnostic(captured)) {
    return [captured]
  }
  if (Array.isArray(captured) && captured.every(isDiagnostic)) {
    return captured
  }
  return diagnosticsOf(captured)
}

/**
 * Asserts that at least one diagnostic of `captured` (diagnostics, or any
 * value `diagnosticsOf` reads; exactly `times`, when given) meets
 * `expected`, and returns the first that does. The failure lists every
 * diagnostic with the reasons it does not match.
 */
export function expectDiagnostic(
  captured: unknown,
  expected: DiagnosticExpectation,
): Diagnostic {
  const all = toDiagnostics(captured)
  const matching = findDiagnostics(all, expected)
  const ok =
    expected.times === undefined
      ? matching.length > 0
      : matching.length === expected.times
  if (!ok) {
    const report = all
      .map((diagnostic, index) => {
        const reasons = mismatches(diagnostic, expected)
        return `#${index} [${diagnostic.severity}] ${reasons.length ? reasons.join('; ') : 'matches'}\n${indent(diagnostic.text)}`
      })
      .join('\n')
    const wanted =
      expected.times === undefined
        ? 'at least one diagnostic'
        : `exactly ${expected.times} diagnostic(s)`
    expect.fail(
      `expected ${wanted} meeting ${inspect(expected, { depth: 2 })}, ${matching.length} of ${all.length} do:\n${report}`,
    )
  }
  return matching[0]!
}

function indent(text: string) {
  return text.replace(/^/gm, '    ')
}

/**
 * Whether `text` names `file` (SPEC §5.7, "absolute or project-relative"):
 * its absolute path (or its real path), or its project-relative path
 * (`file` itself when relative, else relative to `root`) as a whole path,
 * maybe behind `/`, `./` or `../`. With a root, never the tail of another
 * path (`/other/src/a.ts` does not name `src/a.ts` of `/app`).
 */
export function mentionsFile(
  text: string,
  file: string,
  options: { root?: string } = {},
) {
  const posix = (value: string) => value.replaceAll('\\', '/')
  const said = posix(stripVTControlCharacters(text))
  const absolute = path.isAbsolute(file)
    ? file
    : options.root !== undefined
      ? path.join(options.root, file)
      : undefined
  const relative = path.isAbsolute(file)
    ? options.root !== undefined
      ? path.relative(options.root, file)
      : undefined
    : path.normalize(file)
  if (
    absolute !== undefined &&
    [absolute, realOf(absolute)].some(
      (spelling) => spelling !== undefined && said.includes(posix(spelling)),
    )
  ) {
    return true
  }
  // Without a root, the project's own directory may come before it
  const before =
    options.root === undefined ? '(?<![\\w.@$-])' : '(?<![\\w.@$-]|[\\w@$-]/)'
  return (
    relative !== undefined &&
    new RegExp(`${before}${escape(posix(relative))}(?![\\w/-])`).test(said)
  )
}

function realOf(file: string) {
  try {
    return realpathSync(file)
  } catch {
    return undefined
  }
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whether `text` reports `position`: `line:column` (the column 1-based or
 * 0-based, as tools differ); without a column, `file:line`, `line:column`
 * or a code frame's highlighted line (`> line |`, maybe inside a tool's
 * box).
 */
function reportsPosition(
  text: string,
  { line, column }: { line: number; column?: number },
) {
  const pattern =
    column === undefined
      ? `(?<!\\d):${line}(?!\\d)|(?<![\\d:])${line}:\\d|^[^\\w\\n]*>\\s*${line}\\s*\\|`
      : `(?<!\\d)${line}:(?:${column}|${column - 1})(?!\\d)`
  return new RegExp(pattern, 'm').test(text)
}

/** Line terminators of JavaScript (and of editors). */
const lineTerminator = /\r\n|[\n\r\u2028\u2029]/

/**
 * The 1-based line and column of the first occurrence of `needle` (or of
 * an offset) in `source`, counting every JavaScript line terminator.
 */
export function diagnosticPosition(source: string, needle: string | number) {
  const offset = typeof needle === 'number' ? needle : source.indexOf(needle)
  if (offset < 0) {
    throw new Error(`${JSON.stringify(needle)} is not in the source`)
  }
  const lines = source.slice(0, offset).split(lineTerminator)
  return { line: lines.length, column: lines.at(-1)!.length + 1 }
}
