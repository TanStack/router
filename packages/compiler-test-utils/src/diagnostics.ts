/**
 * What a user is told about a problem (SPEC G5, J2.8, §5.7: diagnostics are
 * checked by file and position only).
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
 *   meets it (SPEC G5, §5.7). A diagnostic of unknown owner (`shared`)
 *   meets one only when it names the expected file by its absolute path.
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
   * may be another concurrent test's (`./console-hook`). It meets an
   * expectation only when it names the file by its absolute path.
   */
  shared?: true
}

export interface DiagnosticExpectation {
  /**
   * Accepted severities. Default: `warning` or `error` (an `info` line
   * reports nothing).
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
   * frame's highlighted line. With `file`, a `line:column` or `:line` must
   * come after the text names the file and before it names another one (a
   * code frame's line anywhere).
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
    | {
        file?: unknown
        line?: unknown
        column?: unknown
        start?: { line?: unknown; column?: unknown }
      }
    | string
    | undefined
  const module = record.module as { resource?: unknown } | null | undefined
  const file = [
    typeof loc === 'object' ? loc.file : undefined,
    record.id,
    record.file,
    record.moduleName,
    // a webpack / Rspack compilation error's module (Rsbuild prints its file)
    typeof module?.resource === 'string'
      ? module.resource.split('?')[0]
      : undefined,
  ].find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate !== '',
  )
  if (typeof loc === 'object' && typeof loc.line === 'number') {
    // Rollup, Vite, Babel and esbuild locations have 0-based columns.
    const column = typeof loc.column === 'number' ? `:${loc.column + 1}` : ''
    lines.push(`${file ?? ''}:${loc.line}${column}`)
  } else if (typeof loc === 'object' && typeof loc.start?.line === 'number') {
    // a webpack / Rspack error's `loc` (`DependencyLocation`), printed as
    // given: `./src/a.tsx 3:7`
    const { line, column } = loc.start
    lines.push(
      `${file ?? ''} ${line}${typeof column === 'number' ? `:${column}` : ''}`,
    )
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
  /**
   * The parts of the text that are about the file: each from where it names
   * the file to where it names another (all of it without `file`).
   */
  const named =
    expected.file === undefined
      ? [diagnostic.text]
      : fileMentions(diagnostic.text, expected.file, {
          ...expected,
          tail: true,
        }).map(({ about }) => about)
  if (named.length === 0) {
    reasons.push(`does not name ${expected.file}`)
  }
  if (
    diagnostic.shared &&
    (expected.file === undefined ||
      !fileMentions(diagnostic.text, expected.file, expected).some(
        ({ absolute }) => absolute,
      ))
  ) {
    // Every open capture received it: a relative path or no path at all
    // may be another work's (`./console-hook`)
    reasons.push(
      'printed outside any scope by work of unknown owner, and does not name the file by its absolute path',
    )
  }
  if (
    expected.position !== undefined &&
    !reportsPosition(diagnostic.text, named, expected.position)
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
 * (`file` itself when relative, else relative to `root`) as a whole path.
 * With a root, a longer path ending with it must be the end of the absolute
 * path (a path relative to the working directory names it, `/other/src/a.ts`
 * does not); what follows `./`, `../` or a leading `/` counts on its own.
 * Source-map sources and other texts name an absolute file only by its
 * absolute path when no root is given. A path is the whole of its spelling:
 * `src/a.ts` does not name `src/a.tsx`, and route groups and parameters
 * (`(auth)/`, `[id]/`) are segments of it; a `(` or `[` that opens the path
 * (a stack frame's) is not.
 */
export function mentionsFile(
  text: string,
  file: string,
  options: { root?: string } = {},
) {
  return fileMentions(text, file, options).length > 0
}

/** What a path can be spelled with in a message (`\\` read as `/`). */
const pathCharacter = /[\w.@$~+%#/()[\]-]/

/**
 * Whether a path spelled in `said` up to `end` ends there: no further path
 * character follows (`src/a.ts` in `src/a.tsx`), nor an extension
 * (`src/a.ts.map`); a sentence's full stop may.
 */
function endsPath(said: string, end: number) {
  const next = said[end] ?? ''
  return (
    !/[\w/-]/.test(next) && !(next === '.' && /\w/.test(said[end + 1] ?? ''))
  )
}

/**
 * The spellings of the path that ends at `end` in `said`: the whole run of
 * path characters, and what follows each `(` or `[` in it (a stack frame's
 * `(/app/src/a.ts`), each without a leading `./` or `../`.
 */
function pathSpellings(said: string, end: number) {
  let start = end
  while (start > 0 && pathCharacter.test(said[start - 1]!)) {
    start--
  }
  const token = said.slice(start, end)
  const spellings: Array<{ start: number; path: string }> = []
  for (let at = 0; at < token.length; at++) {
    if (at === 0 || token[at - 1] === '(' || token[at - 1] === '[') {
      const skipped = /^(?:\.{1,2}\/)*/.exec(token.slice(at))![0].length
      spellings.push({
        start: start + at,
        path: token.slice(at + skipped),
      })
    }
  }
  return spellings
}

/** A naming of a file in a text (`fileMentions`). */
interface FileMention {
  /** Where the naming starts in the text (ANSI colours removed, `\\` as `/`). */
  start: number
  /** Whether it is the file's absolute path (or its real path). */
  absolute: boolean
  /** The text from the naming to where the text names another file. */
  about: string
}

/**
 * Where `text` names `file` (`mentionsFile`), in order. With `tail`
 * (diagnostics), an absolute `file` without a root is also named by the end
 * of its path from one of its directories on (`src/a.ts`, as messages name
 * files relative to the project root).
 */
function fileMentions(
  text: string,
  file: string,
  options: { root?: string; tail?: boolean },
): Array<FileMention> {
  const posix = (value: string) => value.replaceAll('\\', '/')
  const said = posix(stripVTControlCharacters(text))
  const absolute = path.isAbsolute(file)
    ? file
    : options.root !== undefined
      ? path.join(options.root, file)
      : undefined
  const relative = path.isAbsolute(file)
    ? options.root !== undefined
      ? posix(path.relative(options.root, file))
      : undefined
    : posix(path.normalize(file))
  const absolutes = [
    ...new Set(
      (absolute === undefined ? [] : [absolute, realOf(absolute)])
        .filter((spelling): spelling is string => spelling !== undefined)
        .map(posix),
    ),
  ]
  /**
   * Whether a spelled path (no leading `./`) names `file` relatively (its
   * absolute spellings are found as written, below).
   */
  const names = (spelled: string) => {
    const tail = spelled.replace(/^\/+/, '')
    if (relative === undefined) {
      // A diagnostic also names an absolute file by its path from one of its
      // directories on
      return (
        options.tail === true &&
        tail.includes('/') &&
        absolutes.some((spelling) => spelling.endsWith(`/${tail}`))
      )
    }
    return (
      tail === relative ||
      (tail.endsWith(`/${relative}`) &&
        (options.root === undefined ||
          absolutes.some((spelling) => spelling.endsWith(`/${tail}`))))
    )
  }
  /** Where the text names the file: start, end, and whether absolutely. */
  const found = new Map<number, { end: number; absolute: boolean }>()
  for (const spelling of absolutes) {
    for (
      let at = said.indexOf(spelling);
      at !== -1;
      at = said.indexOf(spelling, at + 1)
    ) {
      const end = at + spelling.length
      const before = said.slice(0, at)
      if (
        endsPath(said, end) &&
        (!/[\w.@$~+%#/-]$/.test(before) || /file:\/\/\/?$/.test(before))
      ) {
        found.set(at, { end, absolute: true })
      }
    }
  }
  /** Where the text names another file. */
  const others: Array<number> = []
  // Every other spelled path that ends with a file name (an extension), and
  // the file's project-relative spellings
  for (const match of said.matchAll(/\.[A-Za-z]\w*(?=[^\w/-]|$)/g)) {
    const end = match.index + match[0].length
    if (
      !endsPath(said, end) ||
      [...found].some(([at, mention]) => at < end && end <= mention.end)
    ) {
      continue
    }
    const spellings = pathSpellings(said, end)
    const naming = spellings.find(({ path: spelled }) => names(spelled))
    if (naming) {
      found.set(naming.start, { end, absolute: false })
    } else if (spellings[0]!.path.includes('/')) {
      others.push(spellings[0]!.start)
    }
  }
  if (relative !== undefined && !/\.[A-Za-z]\w*$/.test(relative)) {
    // A file named without an extension: each whole path spelling it
    for (
      let at = said.indexOf(relative);
      at !== -1;
      at = said.indexOf(relative, at + 1)
    ) {
      const end = at + relative.length
      const naming = endsPath(said, end)
        ? pathSpellings(said, end).find(({ path: spelled }) => names(spelled))
        : undefined
      if (naming && !found.has(naming.start)) {
        found.set(naming.start, { end, absolute: false })
      }
    }
  }
  return [...found]
    .sort(([a], [b]) => a - b)
    .map(([start, { absolute: isAbsolute }]) => ({
      start,
      absolute: isAbsolute,
      about: said.slice(
        start,
        others.find((other) => other > start),
      ),
    }))
}

function realOf(file: string) {
  try {
    return realpathSync(file)
  } catch {
    return undefined
  }
}

/**
 * Whether `text` reports `position`: `line:column` (the column 1-based or
 * 0-based, as tools differ) in one of `named` (each the text from where it
 * names the file to where it names another); without a column, also `:line`
 * there, or a code frame's highlighted line (`> line |`, maybe inside a
 * tool's box) anywhere in `text`.
 */
function reportsPosition(
  text: string,
  named: Array<string>,
  { line, column }: { line: number; column?: number },
) {
  const position =
    column !== undefined
      ? new RegExp(`(?<!\\d)${line}:(?:${column}|${column - 1})(?!\\d)`)
      : new RegExp(`(?<!\\d):${line}(?!\\d)|(?<![\\d:])${line}:\\d`)
  return (
    named.some((about) => position.test(about)) ||
    (column === undefined &&
      new RegExp(`^[^\\w\\n]*>\\s*${line}\\s*\\|`, 'm').test(text))
  )
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
