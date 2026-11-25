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
   * The file and position the tool gave as fields (Rollup's `id`/`loc`,
   * webpack's `moduleName`/`loc`), column as the tool prints it. A position
   * in that file is judged by it, not by the text.
   */
  location?: { file: string; line: number; column?: number }
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
  const { file, line, column } = locationOf(record)
  return [
    {
      severity,
      text: describe(record),
      raw: value,
      ...(file !== undefined &&
        line !== undefined && {
          location: { file, line, ...(column !== undefined && { column }) },
        }),
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
  const location = diagnostic.location
  if (
    expected.file !== undefined &&
    location !== undefined &&
    fileMentions(location.file, expected.file, { ...expected, tail: true })
      .mentions.length > 0
  ) {
    // The tool's own fields name the file: they give its position
    const { line, column } = expected.position ?? {}
    if (
      line !== undefined &&
      (location.line !== line ||
        (column !== undefined &&
          location.column !== column &&
          location.column !== column - 1))
    ) {
      reasons.push(
        `reports ${location.line}${location.column === undefined ? '' : `:${location.column}`} in its location`,
      )
    }
    return reasons
  }
  /**
   * The parts of the text that are about the file: each from where it names
   * the file to where it names another (all of it without `file`).
   */
  const { mentions, lead } =
    expected.file === undefined
      ? fileMentionsOfAll(diagnostic.text)
      : fileMentions(diagnostic.text, expected.file, {
          ...expected,
          tail: true,
        })
  if (mentions.length === 0) {
    reasons.push(`does not name ${expected.file}`)
  }
  if (
    expected.position !== undefined &&
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
 * (`shared`) counts however it names the file: it may be this work's.
 */
export function expectNoDiagnostic(
  captured: unknown,
  expected: Omit<DiagnosticExpectation, 'times'>,
  message = 'expected no diagnostic',
) {
  const matching = toDiagnostics(captured).filter(
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

/**
 * The path a spelled token names: without an opening `(` or `[` that does
 * not close in it (a stack frame's), from after its last `/@fs` (Vite's path
 * of a file outside the root), without a URL's authority (`//app` of
 * `webpack://app/./src/a.ts`), with `.` and `..` segments read
 * (`path.posix.normalize`).
 */
function normalizedPath(token: string) {
  let spelled = token
  while (
    (spelled.startsWith('(') && count(spelled, '(') > count(spelled, ')')) ||
    (spelled.startsWith('[') && count(spelled, '[') > count(spelled, ']'))
  ) {
    spelled = spelled.slice(1)
  }
  const fs = spelled.lastIndexOf('/@fs/')
  if (fs !== -1) {
    spelled = spelled.slice(fs + '/@fs'.length)
  }
  return path.posix.normalize(spelled.replace(/^\/\/(?!\/)[^/]*/, ''))
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
 * root). Every spelled path is read the same way (`normalizedPath`).
 */
function fileMentions(
  text: string,
  file: string,
  options: { root?: string; tail?: boolean },
): { mentions: Array<FileMention>; lead: Array<number> } {
  const posix = (value: string) => value.replaceAll('\\', '/')
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
  /** How a spelled path names `file`, if it does. */
  const names = (token: string): 'absolute' | 'relative' | undefined => {
    const normalized = normalizedPath(token)
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
  /** The start of the run of path characters that ends at `at`. */
  const runStart = (at: number) => {
    let start = at
    while (start > 0 && pathCharacter.test(prose[start - 1]!)) {
      start--
    }
    return start
  }
  /** What to look for: the file's spellings, each found as written. */
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
  /** The namings found, by where they end. */
  const found = new Map<number, { start: number; absolute: boolean }>()
  for (const needle of needles) {
    for (
      let at = prose.indexOf(needle);
      at !== -1;
      at = prose.indexOf(needle, at + 1)
    ) {
      const end = at + needle.length
      const start = runStart(at)
      const how = endsPath(prose, end)
        ? names(prose.slice(start, end))
        : undefined
      const known = found.get(end)
      if (how !== undefined && (!known || start < known.start)) {
        found.set(end, { start, absolute: how === 'absolute' })
      }
    }
  }
  const within = (index: number) =>
    [...found].some(([end, { start }]) => start <= index && index < end)
  /**
   * Where the text names some other file: a path with a directory and an
   * extension or a position after it, a file of a source extension, a URL's
   * path only with a position after it.
   */
  const others: Array<number> = []
  for (const match of prose.matchAll(/[\w.@$~+%#/()[\]-]+/g)) {
    let token = match[0].replace(/[.]+$/, '')
    while (
      (token.endsWith(')') && count(token, ')') > count(token, '(')) ||
      (token.endsWith(']') && count(token, ']') > count(token, '['))
    ) {
      token = token.slice(0, -1)
    }
    const start = match.index
    const end = start + token.length
    const normalized = normalizedPath(token)
    if (
      within(start) ||
      names(token) !== undefined ||
      normalized === '.' ||
      normalized === '/'
    ) {
      continue
    }
    const positioned = /^:\d/.test(prose.slice(end))
    const url = (prose.slice(0, start).match(/\S*$/)![0] + token).includes(
      '://',
    )
    if (
      url
        ? positioned && normalized.includes('/')
        : normalized.includes('/')
          ? /\.[A-Za-z]\w*$/.test(normalized) || positioned
          : sourceExtension.test(normalized)
    ) {
      others.push(start)
    }
  }
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
