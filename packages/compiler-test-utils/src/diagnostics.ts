/**
 * One diagnostic oracle (FIX-PLAN A9; SPEC G5, J2.8, J4.10, §5.7).
 *
 * Tests capture what the user actually sees (a thrown or rejected error, a
 * bundler's errors and warnings, console output) and assert outcomes only:
 * the severity, the file named, the original position, the API or option
 * names the user acts on, and, for `createServerOnlyFn`/`createClientOnlyFn`,
 * the environment restriction. Never the prose, the code-frame layout or
 * context length, nor whether a file is spelled absolute or project-relative
 * (SPEC §5.7).
 *
 * API:
 * - `diagnosticsOf(value, severity?)`: the diagnostics a captured value
 *   carries: an error (one diagnostic, including the errors it aggregates,
 *   e.g. a `BuildError`, plus one per warning it carries), a build result
 *   or stats object without a message (one per error and per warning), a
 *   Rollup, esbuild or webpack message object, a string, or an array.
 * - `captureThrow(run)`: the diagnostics of what `run` throws or rejects
 *   with; fails when it completes.
 * - `captureConsole(run)`: what `run` logs through `console`, by severity
 *   (`error`; `warn` is `warning`; `log`/`info`/`debug` are `info`), silenced.
 * - `findDiagnostics(diagnostics, expectation)` and
 *   `expectDiagnostic(diagnostics, expectation)`: the diagnostics meeting a
 *   `DiagnosticExpectation`; the latter fails, listing why each diagnostic
 *   does not match, unless one (or exactly `times`) does. Both take
 *   diagnostics or any value `diagnosticsOf` reads. `mismatches(diagnostic,
 *   expectation)` gives the reasons for one diagnostic.
 * - `mentionsFile(text, file, options?)`: whether a text names a file.
 * - `diagnosticPosition(source, needle)`: the 1-based line and column of
 *   the first occurrence of `needle` in `source`.
 * - `identifiesEnvRestriction(error, env)`, `envRestrictionError(env)` (an
 *   asymmetric matcher) and `expectEnvRestrictionThrow(run, env)`: J4.10.
 *
 * Accepted spellings (any one suffices):
 * - File: an absolute path, a `file://` URL, a Vite `/@fs/` URL, a
 *   `webpack://<namespace>/` source, or any trailing run of whole path
 *   segments of the file (`src/routes/posts.tsx`, `routes/posts.tsx`,
 *   `posts.tsx`), with `/` or `\` separators, a query or a position suffix.
 *   A trailing run that also names a file of `distinctFrom` is ambiguous and
 *   does not count.
 * - Position: the file followed by `:line`, `:line:column`, `(line,column)`
 *   or ` line:column`; a code frame line for `line` marked with `>` or
 *   followed by a `^` marker (the marker gives the column when `source` is
 *   known); a bracketed `(line:column)` or `[line:column]`; `line <line>` (and
 *   `column <column>`); or a structured `loc`. Tools disagree on 0- or
 *   1-based columns, so both are accepted.
 * - Names: each API or option name as a whole identifier, anywhere.
 */
import path from 'node:path'
import { realpathSync } from 'node:fs'
import { formatWithOptions, inspect, stripVTControlCharacters } from 'node:util'
import { expect, vi } from 'vitest'

export type Severity = 'error' | 'warning' | 'info'

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
}

export interface DiagnosticExpectation {
  /** Accepted severities (any by default). */
  severity?: Severity | Array<Severity>
  /**
   * The file the diagnostic must name: absolute, or relative to `root`
   * (relative without `root`: matched as trailing path segments).
   */
  file?: string
  /** The project root `file` is relative to. */
  root?: string
  /** Other files the named file must be distinguishable from. */
  distinctFrom?: Array<string>
  /**
   * The original position the diagnostic must report: 1-based line, and
   * optionally 1-based column (a 0-based spelling is accepted too).
   */
  position?: { line: number; column?: number }
  /**
   * The original source of `file`; lets a code frame's `^` marker give the
   * column of `position`.
   */
  source?: string
  /** API or option names the diagnostic must name (whole identifiers). */
  names?: Array<string>
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
    { severity, text: describe(record), raw: value },
    ...diagnosticsOf(warnings, 'warning'),
  ]
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

const consoleSeverities = {
  error: 'error',
  warn: 'warning',
  log: 'info',
  info: 'info',
  debug: 'info',
} as const

/** The diagnostics arrays of the `captureConsole` calls running now. */
const activeCaptures = new Set<Array<Diagnostic>>()
/** The console spies, installed while a capture runs. */
let consoleSpies: Array<{ mockRestore: () => void }> | undefined

/**
 * Runs `run` and collects what it logs through `console` (silenced), as
 * diagnostics. Console methods are restored afterwards, also when `run`
 * throws. Captures may overlap (concurrent tests): each one gets what is
 * logged while it runs, and the console is restored when the last one
 * ends.
 */
export async function captureConsole<T>(
  run: () => T | Promise<T>,
): Promise<{ result: T; diagnostics: Array<Diagnostic> }> {
  const diagnostics: Array<Diagnostic> = []
  activeCaptures.add(diagnostics)
  const spies = (consoleSpies ??= (
    Object.keys(consoleSeverities) as Array<keyof typeof consoleSeverities>
  ).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: Array<unknown>) => {
      const diagnostic: Diagnostic = {
        severity: consoleSeverities[method],
        text: stripVTControlCharacters(
          args
            .map((arg) =>
              arg instanceof Error
                ? describe(arg as unknown as Record<string, unknown>)
                : typeof arg === 'string'
                  ? arg
                  : formatWithOptions({ colors: false }, '%o', arg),
            )
            .join(' '),
        ),
        raw: args,
      }
      for (const capture of activeCaptures) {
        capture.push(diagnostic)
      }
    }),
  ))
  try {
    return { result: await run(), diagnostics }
  } finally {
    activeCaptures.delete(diagnostics)
    if (activeCaptures.size === 0) {
      for (const spy of spies) {
        spy.mockRestore()
      }
      consoleSpies = undefined
    }
  }
}

/** Why `diagnostic` does not meet `expected` (empty when it does). */
export function mismatches(
  diagnostic: Diagnostic,
  expected: DiagnosticExpectation,
): Array<string> {
  const reasons: Array<string> = []
  if (expected.severity !== undefined) {
    const severities = ([] as Array<Severity>).concat(expected.severity)
    if (!severities.includes(diagnostic.severity)) {
      reasons.push(
        `severity ${diagnostic.severity}, expected ${severities.join(' or ')}`,
      )
    }
  }
  const fileMentions =
    expected.file === undefined
      ? []
      : fileTokens(diagnostic.text, expected.file, expected)
  if (expected.file !== undefined && fileMentions.length === 0) {
    reasons.push(`does not name ${expected.file} unambiguously`)
  }
  if (
    expected.position !== undefined &&
    !reportsPosition(
      diagnostic.text,
      expected.position,
      fileMentions,
      expected.source,
    )
  ) {
    const { line, column } = expected.position
    reasons.push(
      `does not report line ${line}${column === undefined ? '' : `, column ${column}`}`,
    )
  }
  for (const name of expected.names ?? []) {
    if (!namesIdentifier(diagnostic.text, name)) {
      reasons.push(`does not name \`${name}\``)
    }
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

/** Whether `text` names `name` as a whole identifier. */
function namesIdentifier(text: string, name: string) {
  return new RegExp(
    `(?<![\\w$])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`,
  ).test(text)
}

// ---------------------------------------------------------------------------
// Files

export interface FileOptions {
  root?: string
  distinctFrom?: Array<string>
}

/**
 * A path token in a message: path characters (no quotes, spaces, colons,
 * queries or parentheses), after an optional drive letter.
 */
const pathToken = /(?:\/{0,3}[A-Za-z]:(?=[\\/]))?[\w@.~+\-/\\%$#]+/g

/**
 * A token as a path: `/` separators, without URL scheme remnants (the
 * `///` of `file:///`, Vite's `/@fs`), hash, trailing sentence dots or URI
 * encoding.
 */
function normaliseToken(raw: string) {
  let token = raw.replaceAll('\\', '/')
  token = token.replace(/^\/+(?=[A-Za-z]:\/)/, '')
  token = token.replace(/^\/{2,}/, '/')
  token = token.replace(/^\/@fs(?=\/)/, '')
  token = token.replace(/#.*$/, '')
  token = token.replace(/\.+$/, '')
  try {
    token = decodeURI(token)
  } catch {
    // Not URI-encoded.
  }
  return token
}

/** `file` as an absolute path (posix separators), when `root` is known. */
function absoluteOf(file: string, root: string | undefined) {
  const posix = file.replaceAll('\\', '/')
  if (path.posix.isAbsolute(posix) || /^[A-Za-z]:\//.test(posix)) {
    return posix
  }
  return root === undefined
    ? undefined
    : path.posix.join(root.replaceAll('\\', '/'), posix)
}

function realOf(file: string | undefined) {
  if (file === undefined) {
    return undefined
  }
  try {
    return realpathSync(file).replaceAll('\\', '/')
  } catch {
    return undefined
  }
}

/** Whether a normalised token denotes `file` (see the file header). */
function denotes(token: string, file: string, root: string | undefined) {
  if (!/[\w$]\.[\w]+$/.test(token) && !token.includes('/')) {
    return false
  }
  // Leading `./` and `../` (a source relative to its map) are dropped: the
  // rest must be trailing segments of the file.
  const relative = path.posix.normalize(token).replace(/^(?:\.\.?\/)+/, '')
  const absolute = absoluteOf(file, root)
  const fileRelative = path.posix
    .normalize(file.replaceAll('\\', '/'))
    .replace(/^(?:\.\/)+/, '')
  const tokenIsAbsolute = token.startsWith('/') || /^[A-Za-z]:\//.test(token)
  const isSuffix = (whole: string, part: string) =>
    whole === part || whole.endsWith(`/${part}`)
  if (tokenIsAbsolute) {
    if (absolute !== undefined) {
      const normal = path.posix.normalize(token)
      return normal === absolute || normal === realOf(absolute)
    }
    return isSuffix(path.posix.normalize(token), fileRelative)
  }
  // `webpack://<namespace>/./src/a.ts` leaves `<namespace>/./src/a.ts` once
  // the scheme is gone; its path after the namespace is project-relative.
  const candidates = [relative]
  const namespaced = /^[^/]*\/\.\/(.*)$/.exec(token)
  if (namespaced) {
    candidates.push(path.posix.normalize(namespaced[1]!))
  }
  return candidates.some((candidate) =>
    absolute !== undefined
      ? isSuffix(absolute, candidate)
      : isSuffix(fileRelative, candidate) || isSuffix(candidate, fileRelative),
  )
}

/**
 * The tokens of `text` that name `file` unambiguously, with the index just
 * after each (where a position suffix starts).
 */
function fileTokens(text: string, file: string, options: FileOptions = {}) {
  const found: Array<{ token: string; end: number }> = []
  for (const match of text.matchAll(pathToken)) {
    const start = match.index
    // `webpack://<namespace>/<path>` sources: the scheme and its slashes go.
    const token = normaliseToken(
      text.slice(Math.max(0, start - 8), start) === 'webpack:'
        ? match[0].replace(/^\/\//, '')
        : match[0],
    )
    if (!denotes(token, file, options.root)) {
      continue
    }
    if (
      options.distinctFrom?.some((other) => denotes(token, other, options.root))
    ) {
      continue
    }
    // The end of the token in `text`, before trailing dots of a sentence.
    const end = start + match[0].replace(/\.+$/, '').length
    found.push({ token, end })
  }
  return found
}

/**
 * Whether `text` names `file`: absolute, project-relative (to `root`) or as
 * trailing path segments, unambiguous among `distinctFrom`.
 */
export function mentionsFile(
  text: string,
  file: string,
  options: FileOptions = {},
) {
  return fileTokens(stripVTControlCharacters(text), file, options).length > 0
}

// ---------------------------------------------------------------------------
// Positions

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

function columnMatches(reported: number, column: number | undefined) {
  return column === undefined || reported === column || reported === column - 1
}

function reportsPosition(
  text: string,
  position: { line: number; column?: number },
  fileMentions: Array<{ end: number }>,
  source: string | undefined,
) {
  const { line, column } = position
  // The file followed by its position.
  for (const { end } of fileMentions) {
    const after = text.slice(end, end + 24)
    const suffix = /^(?::(\d+)(?::(\d+))?|\((\d+),(\d+)\)| (\d+):(\d+))/.exec(
      after,
    )
    if (suffix) {
      const reportedLine = Number(suffix[1] ?? suffix[3] ?? suffix[5])
      const reportedColumn = suffix[2] ?? suffix[4] ?? suffix[6]
      if (
        reportedLine === line &&
        (column === undefined ||
          (reportedColumn !== undefined &&
            columnMatches(Number(reportedColumn), column)))
      ) {
        return true
      }
    }
  }
  // A bracketed `(line:column)` (Babel) or `[line:column]` (a miette
  // frame header, as SWC prints it).
  for (const match of text.matchAll(/[([](\d+):(\d+)[)\]]/g)) {
    if (Number(match[1]) === line && columnMatches(Number(match[2]), column)) {
      return true
    }
  }
  // `line 12` (and `column 5`).
  if (
    new RegExp(`\\bline:?\\s+${line}\\b`, 'i').test(text) &&
    (column === undefined ||
      [column, column - 1].some((candidate) =>
        new RegExp(`\\bcol(?:umn)?:?\\s+${candidate}\\b`, 'i').test(text),
      ))
  ) {
    return true
  }
  return frameReportsPosition(text, line, column, source)
}

/**
 * Whether a code frame in `text` marks `line` (a `>` marker, or a `^`
 * marker line below it) and, when `column` and `source` are known, puts a
 * `^` under that column.
 */
function frameReportsPosition(
  text: string,
  line: number,
  column: number | undefined,
  source: string | undefined,
) {
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const frameLine = /^\s*(>)?\s*(\d+)\s*[|│]/.exec(lines[index]!)
    if (!frameLine || Number(frameLine[2]) !== line) {
      continue
    }
    const markerLine = lines[index + 1] ?? ''
    const caret = /^\s*>?\s*[|│]\s*\^/.test(markerLine)
      ? markerLine.indexOf('^')
      : -1
    if (!frameLine[1] && caret < 0) {
      continue
    }
    if (column === undefined) {
      return true
    }
    if (caret < 0 || source === undefined) {
      continue
    }
    // Where the quoted source line starts in the frame line.
    const sourceLine = source.split(lineTerminator)[line - 1] ?? ''
    const gutter = lines[index]!.search(/[|│]/)
    const start = lines[index]!.indexOf(sourceLine, gutter + 1)
    if (start >= 0 && columnMatches(caret - start + 1, column)) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Environment restrictions (J4.10)

export type Environment = 'server' | 'client'

/** How a message may name each environment. */
const environmentNames: Record<Environment, RegExp> = {
  server: /server/i,
  client: /client|browser/i,
}

/** Errors the engine throws when code crashes, not deliberate errors. */
const engineErrors = new Set([
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
])

/**
 * Whether `error` is a deliberate error (not an engine `TypeError`,
 * `ReferenceError`, …) whose message names the environment `env` the
 * called function is restricted to (`client` may be called `browser`).
 * The prose is free (SPEC §5.7, J4.10).
 */
export function identifiesEnvRestriction(error: unknown, env: Environment) {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (typeof message !== 'string') {
    return false
  }
  if (typeof name === 'string' && engineErrors.has(name)) {
    return false
  }
  return environmentNames[env].test(stripVTControlCharacters(message))
}

/**
 * An asymmetric matcher of an error restricting a function to `env`
 * (`identifiesEnvRestriction`), for `toEqual` and deep equality.
 */
export function envRestrictionError(env: Environment) {
  return expect.toSatisfy(
    (value: unknown) => identifiesEnvRestriction(value, env),
    `an error restricting the call to the ${env}`,
  )
}

/**
 * Calls `run` and asserts it throws (or, when it returns a promise,
 * rejects with) an error restricting it to `env`. Returns the error.
 */
export function expectEnvRestrictionThrow(
  run: () => unknown,
  env: Environment,
): unknown {
  let result: unknown
  try {
    result = run()
  } catch (error) {
    return check(error)
  }
  if (result instanceof Promise) {
    return result.then(
      (value: unknown) => {
        throw new Error(
          `expected a call restricted to the ${env} to reject, it resolved with ${inspect(value)}`,
        )
      },
      (error: unknown) => check(error),
    )
  }
  expect.fail(
    `expected a call restricted to the ${env} to throw, it returned ${inspect(result, { depth: 2 })}`,
  )

  function check(error: unknown) {
    expect(error, `an error restricting the call to the ${env}`).toEqual(
      envRestrictionError(env),
    )
    return error
  }
}
