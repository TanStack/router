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
 *   An absence is `expectNoDiagnostic`, which reads every channel a
 *   build's result or error carries (`everyChannelOf`).
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
   * The files and positions the tool gave as fields (Rollup's `id`/`loc`,
   * webpack's `moduleName`/`loc`): the object's own (`own`) and those of the
   * errors it aggregates and its cause, column as the tool prints it, and how
   * the text prints each (`printed`). Its own location in a file decides the
   * position there, with the others; without one, the text does, with them.
   */
  locations?: Array<{
    file: string
    line?: number
    column?: number
    printed: string
    own?: true
    /** Its file is a webpack or Rspack request (`loader!./src/a.ts`). */
    request?: true
  }>
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
  if (
    !hasMessage(record) &&
    (Array.isArray(record.errors) || Array.isArray(record.warnings))
  ) {
    // A build result or stats: its errors and warnings are the diagnostics.
    return [
      ...diagnosticsOf(errors, 'error'),
      ...diagnosticsOf(warnings, 'warning'),
    ]
  }
  // An error (with the errors it aggregates, e.g. a `BuildError` or an
  // esbuild failure, read as one) and the warnings it carries.
  const locations = locationsOf(record)
  return [
    {
      severity,
      text: describe(record),
      raw: value,
      ...(locations.length > 0 && { locations }),
    },
    ...diagnosticsOf(warnings, 'warning'),
  ]
}

/**
 * The located positions of an error object, its aggregated errors and its
 * cause (as `describe` prints them, to the same depth).
 */
function locationsOf(
  record: Record<string, unknown>,
  depth = 0,
): NonNullable<Diagnostic['locations']> {
  const { file, line, column, printed, request } = locationOf(record)
  return [
    ...(file !== undefined
      ? [
          {
            file,
            ...(request && { request }),
            ...(line !== undefined && { line }),
            ...(column !== undefined && { column }),
            printed,
            ...(depth === 0 && { own: true as const }),
          },
        ]
      : []),
    ...(depth < 3
      ? [
          ...(Array.isArray(record.errors) ? record.errors : []),
          record.cause,
        ].flatMap((nested) =>
          nested && typeof nested === 'object'
            ? locationsOf(nested as Record<string, unknown>, depth + 1)
            : [],
        )
      : []),
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
 * The file and position an error or a warning object gives as fields, and
 * how its text prints them: Rollup, Vite, Babel and esbuild `loc` (0-based
 * column, printed 1-based: `file:3:8`); webpack and Rspack `loc.start`
 * (`DependencyLocation`) and `line:column-column` strings, printed as given
 * (`./src/a.tsx 3:7`).
 */
function locationOf(record: Record<string, unknown>): {
  file?: string
  line?: number
  column?: number
  printed: string
  /** The file is a webpack or Rspack request (`moduleName`: loaders, `!`). */
  request?: true
} {
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
  const request = file !== undefined && file === record.moduleName
  const located = locationParts(loc, file)
  return request ? { ...located, request } : located
}

/** `locationOf` of a tool's `loc` field and the file it is in. */
function locationParts(
  loc:
    | {
        file?: unknown
        line?: unknown
        column?: unknown
        start?: { line?: unknown; column?: unknown }
      }
    | string
    | undefined,
  file: string | undefined,
): { file?: string; line?: number; column?: number; printed: string } {
  if (typeof loc === 'object' && typeof loc.line === 'number') {
    const column = typeof loc.column === 'number' ? loc.column + 1 : undefined
    return {
      file,
      line: loc.line,
      column,
      printed: `${file ?? ''}:${loc.line}${column === undefined ? '' : `:${column}`}`,
    }
  }
  if (typeof loc === 'object' && typeof loc.start?.line === 'number') {
    const { line, column } = loc.start
    return {
      file,
      line,
      column: typeof column === 'number' ? column : undefined,
      printed: `${file ?? ''} ${line}${typeof column === 'number' ? `:${column}` : ''}`,
    }
  }
  if (typeof loc === 'string') {
    const [, line, column] = /^(\d+)(?::(\d+))?/.exec(loc) ?? []
    return {
      file,
      line: line === undefined ? undefined : Number(line),
      column: column === undefined ? undefined : Number(column),
      printed: `${file ?? ''} ${loc}`,
    }
  }
  return { file, printed: file ?? '' }
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
  const { printed } = locationOf(record)
  if (printed !== '') {
    lines.push(printed)
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

/**
 * Why `diagnostic` does not meet `expected` (empty when it does): its
 * severity, file and position, and, for output of unknown owner (`shared`),
 * that it names the file by its absolute path.
 */
export function mismatches(
  diagnostic: Diagnostic,
  expected: DiagnosticExpectation,
): Array<string> {
  const reasons = contentMismatches(diagnostic, expected)
  if (
    diagnostic.shared &&
    (expected.file === undefined ||
      !fileMentions(diagnostic.text, expected.file, expected).mentions.some(
        ({ absolute }) => absolute,
      ))
  ) {
    // Every open capture received it: a relative path or no path at all
    // may be another work's (`./console-hook`)
    reasons.push(
      'printed outside any scope by work of unknown owner, and does not name the file by its absolute path',
    )
  }
  return reasons
}

/** Why `diagnostic`'s severity, file or position do not meet `expected`. */
function contentMismatches(
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
  const reader =
    expected.file === undefined
      ? undefined
      : pathReader(expected.file, { ...expected, tail: true })
  const locations = diagnostic.locations ?? []
  const located = reader
    ? locations.filter(({ file, request }) => fieldNames(file, reader, request))
    : []
  const { line, column } = expected.position ?? {}
  const atPosition = located.some(
    (location) =>
      location.line === line &&
      (column === undefined ||
        location.column === column ||
        location.column === column - 1),
  )
  if (located.some(({ own, line }) => own && line !== undefined)) {
    // The tool's own fields name the file: they give its positions
    if (line !== undefined && !atPosition) {
      reasons.push(
        `reports ${located.map((location) => `${location.line}${location.column === undefined ? '' : `:${location.column}`}`).join(', ')} in its locations`,
      )
    }
    return reasons
  }
  // The text: a line that prints a field naming another file names that
  // file (it ends the file's part), whatever its spelling reads as (an
  // expectation of no file reads all of it)
  const elsewhere = new Set(
    reader
      ? locations
          .filter((location) => !located.includes(location))
          .map(({ printed }) => printed)
      : [],
  )
  let text = ''
  const boundaries: Array<number> = []
  for (const line of diagnostic.text.split(/(?<=\n)/)) {
    if (elsewhere.has(line.replace(/\r?\n$/, ''))) {
      boundaries.push(text.length)
      text += line.replace(/[^\n]/g, ' ')
    } else {
      text += line
    }
  }
  /**
   * The parts of the text that are about the file: each from where it names
   * the file to where it names another (all of it without `file`).
   */
  const { mentions, lead } =
    expected.file === undefined
      ? fileMentionsOfAll(text)
      : fileMentions(
          text,
          expected.file,
          { ...expected, tail: true },
          boundaries,
        )
  if (mentions.length === 0 && located.length === 0) {
    reasons.push(`does not name ${expected.file}`)
  }
  if (
    expected.position !== undefined &&
    !atPosition &&
    !reportsPosition(mentions, lead, expected.position)
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

/** What a build reported on each channel (`BuildResult`, `BuildError`). */
export interface BuildReports {
  /** The bundler's own reports and its plugins'. */
  warnings: Array<Diagnostic>
  /** What the build printed (`console.*`, the process streams). */
  consoleMessages: Array<Diagnostic>
}

/**
 * The diagnostics of `captured` (`toDiagnostics`) and, for a build's result
 * or error, what it printed (`consoleMessages`): every channel, which an
 * absence check reads.
 */
export function everyChannelOf(captured: unknown): Array<Diagnostic> {
  const printed =
    typeof captured === 'object' &&
    captured !== null &&
    !Array.isArray(captured) &&
    !isDiagnostic(captured)
      ? (captured as { consoleMessages?: unknown }).consoleMessages
      : undefined
  return [
    ...toDiagnostics(captured),
    ...(Array.isArray(printed) ? toDiagnostics(printed) : []),
  ]
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

/**
 * Asserts that no diagnostic of `captured` meets `expected` (the "is not
 * reported" check), and fails with the ones that do. Output of unknown owner
 * (`shared`) counts however it names the file: it may be this work's. A
 * build's result or error is read on every channel (`everyChannelOf`).
 */
export function expectNoDiagnostic(
  captured: unknown,
  expected: Omit<DiagnosticExpectation, 'times'>,
  message = 'expected no diagnostic',
) {
  const matching = everyChannelOf(captured).filter(
    (diagnostic) => contentMismatches(diagnostic, expected).length === 0,
  )
  if (matching.length > 0) {
    expect.fail(
      `${message} meeting ${inspect(expected, { depth: 2 })}, ${matching.length} do:\n${matching
        .map(
          (diagnostic) =>
            `[${diagnostic.severity}${diagnostic.shared ? ', printed outside any scope by work of unknown owner' : ''}]\n${indent(diagnostic.text)}`,
        )
        .join('\n')}`,
    )
  }
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
  return fileMentions(text, file, options).mentions.length > 0
}

/** What a path can be spelled with in a message (`\\` read as `/`), but a space. */
const pathCharacter = /[\w.@$~+%#/()[\]-]/

/**
 * The extensions of a file a message names without a directory
 * (`imported from index.ts:8:1`).
 */
const sourceExtension =
  /\.(?:[cm]?[jt]sx?|vue|svelte|astro|mdx?|json|css|scss|sass|less|html)$/

/**
 * A code frame's line: a numbered line of source (`  2 | …`, `> 3 | …`,
 * `2 │ …`) or a marker line under one (`    |  ^`, `   · ─`).
 */
const frameLine = /^[^\w\n]*(?:>\s*)?\d+\s*[|│]|^\s*[|│·]\s*[\^~─]/
/** A code frame's highlighted line (`> 3 |`). */
const highlightedLine = /^[^\w\n]*>\s*(\d+)\s*[|│]/

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

/** How often `character` occurs in `text`. */
const count = (text: string, character: string) =>
  text.split(character).length - 1

const posix = (value: string) => value.replaceAll('\\', '/')

/** The bundlers' module URLs: a namespace, then the path from `./`. */
const bundlerSchemes = new Set(['webpack', 'webpack-internal'])

/**
 * The path a spelled path names, or `undefined` for none (a web URL's path,
 * which names no file but through Vite's `/@fs`). `scheme` is the URL's it
 * is spelled in (`webpack://app/./src/a.ts`: `webpack`). Read: without an
 * opening `(` or `[` that does not close in it (a stack frame's); a bundler
 * URL's path from its `./` on (or without its namespace); a `file:` URL's
 * without its host; from after a `/@fs` (Vite's path of a file outside the
 * root); with `.` and `..` segments and `//` read (`path.posix.normalize`).
 */
function normalizedPath(token: string, scheme?: string) {
  let spelled = token
  while (
    (spelled.startsWith('(') && count(spelled, '(') > count(spelled, ')')) ||
    (spelled.startsWith('[') && count(spelled, '[') > count(spelled, ']'))
  ) {
    spelled = spelled.slice(1)
  }
  const fs = spelled.lastIndexOf('/@fs/')
  if (scheme !== undefined && bundlerSchemes.has(scheme)) {
    const context = spelled.indexOf('/./')
    spelled =
      context === -1
        ? spelled.replace(/^\/\/[^/]*/, '')
        : spelled.slice(context + 1)
  } else if (fs !== -1) {
    spelled = spelled.slice(fs + '/@fs'.length)
  } else if (scheme === 'file') {
    spelled = spelled.replace(/^\/\/[^/]*/, '')
  } else if (scheme !== undefined) {
    return undefined
  }
  return path.posix.normalize(spelled)
}

/**
 * How spelled paths name `file` (`file` absolute, or relative to `root`):
 * each is read (`normalizedPath`) and so is `file`.
 */
function pathReader(file: string, options: { root?: string; tail?: boolean }) {
  const absolute = path.isAbsolute(file)
    ? path.posix.normalize(posix(file))
    : options.root !== undefined
      ? path.posix.join(posix(options.root), posix(file))
      : undefined
  const relative =
    absolute === undefined
      ? path.posix.normalize(posix(file))
      : options.root !== undefined
        ? path.posix.relative(posix(options.root), absolute)
        : undefined
  const absolutes = [
    ...new Set(
      (absolute === undefined ? [] : [absolute, realOf(absolute)])
        .filter((spelling): spelling is string => spelling !== undefined)
        .map((spelling) => path.posix.normalize(posix(spelling))),
    ),
  ]
  /** How a spelled path names `file`, if it does. */
  const names = (
    token: string,
    scheme?: string,
  ): 'absolute' | 'relative' | undefined => {
    const normalized = normalizedPath(token, scheme)
    if (normalized === undefined) {
      return undefined
    }
    if (absolutes.includes(normalized)) {
      return 'absolute'
    }
    const tail = normalized.replace(/^\/+/, '').replace(/^(?:\.\.\/)+/, '')
    if (relative === undefined) {
      return options.tail === true &&
        tail.includes('/') &&
        absolutes.some((spelling) => spelling.endsWith(`/${tail}`))
        ? 'relative'
        : undefined
    }
    return tail === relative ||
      (tail.endsWith(`/${relative}`) &&
        (options.root === undefined ||
          absolutes.some((spelling) => spelling.endsWith(`/${tail}`))))
      ? 'relative'
      : undefined
  }
  /** The file's spellings, to find as written (with their spaces). */
  const needles = [...absolutes]
  if (relative !== undefined) {
    needles.push(relative)
  } else if (options.tail) {
    // Every end of the path from one of its directories on, longest first
    for (const spelling of absolutes) {
      for (let at = 1; at < spelling.length; at++) {
        if (spelling[at - 1] === '/' && spelling.indexOf('/', at) !== -1) {
          needles.push(spelling.slice(at))
        }
      }
    }
  }
  return { names, needles }
}

/**
 * Whether a tool's field holding a file names the one `reader` reads, read
 * as a path of the text is (`pathReader`), whole: without a virtual id's
 * `\0` and prefixes (`virtual:split:`) and its query; a webpack or Rspack
 * request (`request`) from its resource on (after its loaders' `!`, the
 * `+ 2 modules` of a concatenated module aside). In a URL (`file:`,
 * `webpack:`), `#` starts a fragment; in a plain path, it is part of the
 * name (`C# project #2/`, `a.ts#copy.ts`).
 *
 * Limit: an id or resource of a request with a fragment (`./a.ts#x`) is a
 * plain path whose `#x` reads as part of the name: webpack's
 * `module.resource`, and Vite's module id (`/app/src/a.ts#x`).
 */
function fieldNames(
  field: string,
  reader: ReturnType<typeof pathReader>,
  request?: boolean,
) {
  let spelled = posix(field).replace(/^\0/, '')
  if (request) {
    spelled = spelled.replace(/^.*!/, '').replace(/ \+ \d+ modules?$/, '')
  }
  spelled = spelled.replace(/\?.*$/, '')
  const scheme = /^([A-Za-z][\w+.-]*):(?=\/\/)/.exec(spelled)?.[1]
  if (scheme !== undefined) {
    return (
      reader.names(
        spelled.slice(scheme.length + 1).replace(/#.*$/, ''),
        scheme.toLowerCase(),
      ) !== undefined
    )
  }
  return (
    reader.names(spelled.replace(/^(?:[\w-]{2,}:)+(?=\/)/, '')) !== undefined
  )
}

/** A naming of a file in a text (`fileMentions`). */
interface FileMention {
  /** Where the naming starts in the text (ANSI colours removed, `\\` as `/`). */
  start: number
  /** Where it ends. */
  end: number
  /** Whether it is the file's absolute path (or its real path). */
  absolute: boolean
  /**
   * The text from the naming to where the text names another file, but its
   * code frames' lines.
   */
  about: string
  /** The highlighted lines of the code frames in that part. */
  highlighted: Array<number>
}

/**
 * Where `text` names `file` (`mentionsFile`), in order, and the highlighted
 * lines of the code frames before any file is named when `file` is the first
 * it names (`lead`: a frame printed before its location). Code frames name
 * nothing: what their source spells is source (`import … from './b.ts'`, a
 * string `'src/b.ts:8:1'`). With `tail` (diagnostics), an absolute `file`
 * without a root is also named by the end of its path from one of its
 * directories on (`src/a.ts`, as messages name files relative to the project
 * root). Every spelled path, and `file`, is read the same way
 * (`pathReader`): a path is the run of path characters around it (with a
 * drive letter), ending at a `#` or a `(` after its file name.
 *
 * Limits: a percent-encoded path (`/@fs/C%3A/…`) is not decoded; a symlink
 * printed for a real path asked (or a real path for a link) is not resolved
 * but through `realpath` of the asked file, and `..` is read lexically
 * (`node_modules/<link>/..` is not the link's parent); a query value that
 * spells a file (`b.ts?from=src/a.ts`) names it in text.
 */
function fileMentions(
  text: string,
  file: string,
  options: { root?: string; tail?: boolean },
  /** Where the text names another file a tool's field gave. */
  boundaries: ReadonlyArray<number> = [],
): { mentions: Array<FileMention>; lead: Array<number> } {
  const said = posix(stripVTControlCharacters(text))
  // The code frames' lines out of the prose, offsets kept
  const highlights: Array<{ at: number; line: number }> = []
  let prose = ''
  for (const line of said.split(/(?<=\n)/)) {
    if (frameLine.test(line)) {
      const highlighted = highlightedLine.exec(line)
      if (highlighted) {
        highlights.push({ at: prose.length, line: Number(highlighted[1]) })
      }
      prose += line.replace(/[^\n]/g, ' ')
    } else {
      prose += line
    }
  }
  const { names, needles } = pathReader(file, options)
  /** The start of the path spelled up to `at`, with its drive letter. */
  const pathStart = (at: number) => {
    let start = at
    while (start > 0 && pathCharacter.test(prose[start - 1]!)) {
      start--
    }
    if (
      prose[start] === '/' &&
      prose[start - 1] === ':' &&
      /[A-Za-z]/.test(prose[start - 2] ?? '') &&
      !/\w/.test(prose[start - 3] ?? '')
    ) {
      start -= 2
    }
    return start
  }
  /** The scheme of the URL a path spelled from `start` is in, if any. */
  const schemeAt = (start: number) => {
    const word = prose.slice(0, start + 2).match(/\S*$/)![0]
    return /([A-Za-z][\w+.-]*):\/\//.exec(word)?.[1]?.toLowerCase()
  }
  /** The namings found, by where they end. */
  const found = new Map<number, { start: number; absolute: boolean }>()
  const record = (start: number, end: number, token: string) => {
    const how = names(token, schemeAt(start))
    const known = found.get(end)
    if (how !== undefined && (!known || start < known.start)) {
      found.set(end, { start, absolute: how === 'absolute' })
    }
    return how !== undefined
  }
  // The file's spellings as written (a space in a name)
  for (const needle of needles) {
    for (
      let at = prose.indexOf(needle);
      at !== -1;
      at = prose.indexOf(needle, at + 1)
    ) {
      const end = at + needle.length
      const start = pathStart(at)
      // (in a plain path, `#` is part of the name; in a URL, a fragment)
      if (
        endsPath(prose, end) &&
        (prose[end] !== '#' || schemeAt(start) !== undefined)
      ) {
        record(start, end, prose.slice(start, end))
      }
    }
  }
  const within = (index: number) =>
    [...found].some(([end, { start }]) => start <= index && index < end)
  /**
   * Where the text names some other file: a path with a directory and an
   * extension or a position after it, a file of a source extension, a URL's
   * path only with a position after it. Every path token that reads as
   * `file` is a naming of it (`src/temp/../a.ts`).
   */
  const others: Array<number> = [...boundaries]
  for (const match of prose.matchAll(/[\w.@$~+%#/()[\]-]+/g)) {
    const start = pathStart(match.index)
    const trimmed = (spelled: string) => {
      let token = spelled.replace(/[.]+$/, '')
      while (
        (token.endsWith(')') && count(token, ')') > count(token, '(')) ||
        (token.endsWith(']') && count(token, ']') > count(token, '['))
      ) {
        token = token.slice(0, -1)
      }
      return token
    }
    const whole = trimmed(prose.slice(start, match.index) + match[0])
    // The file's naming: in a URL, up to its fragment; in a plain path, all
    const naming =
      schemeAt(start) === undefined ? whole : whole.replace(/#.*$/, '')
    if (within(start) || record(start, start + naming.length, naming)) {
      continue
    }
    // Another file's naming, read strictly: a file name ends at a `#` or
    // a `(line,column)` (it ends the file's part sooner)
    const token = trimmed(/^.*?\.[A-Za-z]\w*(?=[#(])/.exec(whole)?.[0] ?? whole)
    const end = start + token.length
    const scheme = schemeAt(start)
    const normalized = normalizedPath(token, scheme) ?? ''
    if (normalized === '' || normalized === '.' || normalized === '/') {
      // (a web URL: another file only with a position after its path, not
      // the port after its host)
      if (
        scheme !== undefined &&
        token.includes('/') &&
        /^:\d+(?::\d+)?(?![\d/])/.test(prose.slice(end))
      ) {
        others.push(start)
      }
      continue
    }
    const positioned = /^:\d/.test(prose.slice(end))
    if (
      normalized.includes('/')
        ? /\.[A-Za-z]\w*$/.test(normalized) || positioned
        : sourceExtension.test(normalized)
    ) {
      others.push(start)
    }
  }
  others.sort((a, b) => a - b)
  const mentions = [...found]
    .map(([end, { start, absolute: isAbsolute }]) => ({
      start,
      end,
      absolute: isAbsolute,
    }))
    .sort((a, b) => a.start - b.start)
  const first = Math.min(...others, ...mentions.map(({ start }) => start))
  return {
    mentions: mentions.map((mention) => {
      const until =
        others.find((other) => other > mention.start) ?? prose.length
      return {
        ...mention,
        about: prose.slice(mention.start, until),
        highlighted: highlights
          .filter(({ at }) => mention.start <= at && at < until)
          .map(({ line }) => line),
      }
    }),
    lead:
      mentions[0]?.start === first
        ? highlights.filter(({ at }) => at < first).map(({ line }) => line)
        : [],
  }
}

function realOf(file: string) {
  try {
    return realpathSync(file)
  } catch {
    return undefined
  }
}

/** All of a text, for an expectation that names no file. */
function fileMentionsOfAll(text: string) {
  return {
    mentions: [
      {
        about: text,
        highlighted: text
          .split('\n')
          .flatMap((line) => highlightedLine.exec(line)?.[1] ?? [])
          .map(Number),
      },
    ],
    lead: [],
  }
}

/**
 * Whether one of `mentions` reports `position`: `line:column` (the column
 * 1-based or 0-based, as tools differ) in its part of the text; without a
 * column, also `:line` there, or a code frame's highlighted line (`> line |`)
 * there or in `lead`.
 */
function reportsPosition(
  mentions: Array<{ about: string; highlighted: Array<number> }>,
  lead: Array<number>,
  { line, column }: { line: number; column?: number },
) {
  if (column !== undefined) {
    const position = new RegExp(
      `(?<!\\d)${line}:(?:${column}|${column - 1})(?!\\d)`,
    )
    return mentions.some(({ about }) => position.test(about))
  }
  const position = new RegExp(`(?<!\\d):${line}(?!\\d)|(?<![\\d:])${line}:\\d`)
  return (
    mentions.some(
      ({ about, highlighted }) =>
        position.test(about) || highlighted.includes(line),
    ) || lead.includes(line)
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
