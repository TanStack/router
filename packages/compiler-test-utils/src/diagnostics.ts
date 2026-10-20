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
 * - `diagnosticProse(text, source?)`: what a diagnostic says in its own
 *   words: its text without the code-frame lines and caret markers that
 *   quote the source (full, cropped or highlighted), nor the lines quoting
 *   `source` whole or cropped.
 * - Reported locations (SPEC J6.5, §5.7, §5.14): `parseLocation(text)`,
 *   `importLines(file, source, specifier)`,
 *   `importedBindingUses(file, source, specifier)`, `locationMismatch`,
 *   `isRelevantLocation`, `expectRelevantLocation` (a `file:line:column` a
 *   tool reports is one of the relevant places: a genuine use, any line of
 *   the original import of the specifier, another accepted place such as a
 *   marker origin, or no coordinates only where the caller allows it) and
 *   `expectFrameAt` (a code frame highlights the reported line and points
 *   at the reported column of the original source; its context is free).
 * - `diagnosticPosition(source, needle)`: the 1-based line and column of
 *   the first occurrence of `needle` in `source`.
 * - `identifiesEnvRestriction(error, env)`, `envRestrictionError(env)` (an
 *   asymmetric matcher) and `expectEnvRestrictionThrow(run, env)`: J4.10.
 *
 * Accepted spellings (any one suffices):
 * - File (SPEC §5.7, "absolute or project-relative if unambiguous"): an
 *   absolute path, a `file://` URL, a Vite `/@fs/` URL, the project-relative
 *   path (`src/routes/posts.tsx`, also after `./` or a source map's `../`,
 *   or as the path of a `webpack://<namespace>/` source), or a longer
 *   relative path ending with it, with `/` or `\` separators, a query or a
 *   position suffix. A part of the project-relative path alone
 *   (`routes/posts.tsx`, `posts.tsx`) does not name the file: the user
 *   cannot tell which file it is. Segments may hold bracketed groups
 *   (`(group).tsx`, `[id].tsx`). A spelling that also names a file of
 *   `distinctFrom` is ambiguous and does not count.
 * - Position: the file followed by `:line`, `:line:column`, `(line,column)`
 *   or ` line:column`; a code frame line for `line` marked with `>` or
 *   followed by a `^` marker (the marker gives the column when `source` is
 *   known); a bracketed `(line:column)` or `[line:column]`; `line <line>` (and
 *   `column <column>`); or a structured `loc`. Tools disagree on 0- or
 *   1-based columns, so both are accepted.
 * - Names: each API or option name as a whole identifier, anywhere (only in
 *   `diagnosticProse` with `prose`). A name given as a list is satisfied by
 *   any one of its alternatives.
 * - Causes (`causes`): one of the given words or patterns, in the
 *   diagnostic's prose (never in quoted source): what the caller accepts as
 *   the semantic reason, so an internal crash that only names the API, or
 *   quotes it in a frame, does not pass.
 */
import path from 'node:path'
import { realpathSync } from 'node:fs'
import { formatWithOptions, inspect, stripVTControlCharacters } from 'node:util'
import { parseSync } from 'vite'
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
   * (relative without `root`: its project-relative path). See "Accepted
   * spellings".
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
  /**
   * API or option names the diagnostic must name (whole identifiers). A
   * list of alternatives is satisfied by any one of them (e.g. the API
   * called, or the method of it that is wrong).
   */
  names?: Array<string | Array<string>>
  /**
   * The semantic cause the diagnostic must explain: at least one of these
   * words (case-insensitive, at word starts: `captur` matches `captured`)
   * or patterns must appear in its prose (`diagnosticProse`), not in quoted
   * source. The caller lists every wording it accepts for that cause.
   */
  causes?: Array<string | RegExp>
  /**
   * Match `names` in the diagnostic's prose only (`diagnosticProse`, with
   * `source`): a name the code frame quotes does not count.
   */
  prose?: boolean
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
  const prose =
    expected.prose || expected.causes !== undefined
      ? diagnosticProse(diagnostic.text, expected.source)
      : diagnostic.text
  for (const name of expected.names ?? []) {
    const alternatives = ([] as Array<string>).concat(name)
    if (
      !alternatives.some((alternative) =>
        namesIdentifier(expected.prose ? prose : diagnostic.text, alternative),
      )
    ) {
      reasons.push(
        `does not name ${alternatives.map((alternative) => `\`${alternative}\``).join(' or ')}${expected.prose ? ' in its own words' : ''}`,
      )
    }
  }
  if (
    expected.causes !== undefined &&
    !expected.causes.some((cause) => explains(prose, cause))
  ) {
    reasons.push(
      `does not explain the cause (${expected.causes.map(String).join(', ')}) in its own words`,
    )
  }
  return reasons
}

/** Whether `prose` gives `cause` (a word start, case-insensitive, or a pattern). */
function explains(prose: string, cause: string | RegExp) {
  return typeof cause === 'string'
    ? new RegExp(
        `(?<![\\w$])${cause.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i',
      ).test(prose)
    : cause.test(prose)
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
 * Path tokens in a message: path characters (no quotes, spaces, colons,
 * queries or brackets), after an optional drive letter; and the same with
 * bracketed groups inside a segment, as route file names have them
 * (`(group).tsx`, `[id].tsx`, `{-$lang}.tsx`). A group holds no separator,
 * comma or colon, so neither a position suffix (`(3,5)`, `(3:5)`) nor a
 * path quoted in brackets (`(src/a.ts)`) is part of a token; the first
 * pattern still reads a bracket-free name quoted in brackets (`(a.ts)`).
 */
const pathTokens = [
  /(?:\/{0,3}[A-Za-z]:(?=[\\/]))?[\w@.~+\-/\\%$#]+/g,
  /(?:\/{0,3}[A-Za-z]:(?=[\\/]))?(?:[\w@.~+\-/\\%$#]|\([\w@.~+\-%$#]*\)|\[[\w@.~+\-%$#]*\]|\{[\w@.~+\-%$#]*\})+/g,
]

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

/**
 * The project-relative path of `file` (posix separators): `file` itself
 * when it is relative (it is relative to `root`, or to the unknown project
 * root), its path from `root` otherwise; unknown for an absolute `file`
 * without `root`.
 */
function projectRelativeOf(file: string, root: string | undefined) {
  const posix = path.posix.normalize(file.replaceAll('\\', '/'))
  if (!path.posix.isAbsolute(posix) && !/^[A-Za-z]:\//.test(posix)) {
    return posix.replace(/^(?:\.\/)+/, '')
  }
  if (root === undefined) {
    return undefined
  }
  const relative = path.posix.relative(root.replaceAll('\\', '/'), posix)
  return relative.startsWith('../') || path.posix.isAbsolute(relative)
    ? undefined
    : relative
}

/**
 * Whether a normalised token denotes `file` (see the file header): the
 * absolute path, or a relative path holding the whole project-relative
 * path (SPEC §5.7). A trailing part of the project-relative path alone
 * (`other.ts` or `routes/other.ts` for `src/routes/other.ts`) does not.
 */
function denotes(token: string, file: string, root: string | undefined) {
  if (!/[\w$)\]}]\.[\w]+$/.test(token) && !token.includes('/')) {
    return false
  }
  // Leading `./` and `../` (a source relative to its map) are dropped: the
  // rest must hold the project-relative path.
  const relative = path.posix.normalize(token).replace(/^(?:\.\.?\/)+/, '')
  const absolute = absoluteOf(file, root)
  const projectRelative = projectRelativeOf(file, root)
  const tokenIsAbsolute = token.startsWith('/') || /^[A-Za-z]:\//.test(token)
  const isSuffix = (whole: string, part: string) =>
    whole === part || whole.endsWith(`/${part}`)
  if (tokenIsAbsolute) {
    const normal = path.posix.normalize(token)
    if (absolute !== undefined) {
      return normal === absolute || normal === realOf(absolute)
    }
    return projectRelative !== undefined && isSuffix(normal, projectRelative)
  }
  // `webpack://<namespace>/./src/a.ts` leaves `<namespace>/./src/a.ts` once
  // the scheme is gone; its path after the namespace is project-relative.
  const candidates = [relative]
  const namespaced = /^[^/]*\/\.\/(.*)$/.exec(token)
  if (namespaced) {
    candidates.push(path.posix.normalize(namespaced[1]!))
  }
  return candidates.some(
    (candidate) =>
      projectRelative !== undefined &&
      isSuffix(candidate, projectRelative) &&
      (absolute === undefined || isSuffix(absolute, candidate)),
  )
}

/**
 * The tokens of `text` that name `file` unambiguously, with the index just
 * after each (where a position suffix starts).
 */
function fileTokens(text: string, file: string, options: FileOptions = {}) {
  const found: Array<{ token: string; end: number }> = []
  const matches = pathTokens.flatMap((pattern) => [...text.matchAll(pattern)])
  for (const match of matches) {
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
 * Whether `text` names `file`: absolute or project-relative (to `root`; a
 * relative `file` is project-relative), unambiguous among `distinctFrom`
 * (SPEC §5.7). An absolute `file` without `root` is named absolute only.
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
 * A line of a code frame quoted inside another tool's report box (Rspack
 * prints a loader's error in a box whose lines start with `│`), without
 * the box; any other line as it is.
 */
function unboxed(line: string) {
  const inner = line.replace(/^\s*[│┃]/, '')
  return inner !== line &&
    (/^\s*>?\s*\d+\s*[|│]/.test(inner) || /^\s*>?\s*[|│]\s*\^/.test(inner))
    ? inner
    : line
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
  const lines = text.split(/\r?\n/).map(unboxed)
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
// Prose

/**
 * A numbered code-frame line, whole, cropped or highlighted, in any tool's
 * layout: an optional marker, the line number and a separator (`|`, `│`,
 * `┃` or `:`).
 */
const numberedFrameLine = /^\s*[>❯›]?\s*\d+\s*[|│┃:]/
/**
 * A marker line under a frame line: an optional gutter, then `^` or `~`
 * markers (a tool may print the message after them, which is prose).
 */
const markerLine = /^\s*>?\s*\d*\s*[|│┃]?\s*[\^~][\^~\s-]*/
/** Where a tool cropped a quoted line. */
const cropMarker = /…|\.{3}/

/**
 * What a diagnostic says in its own words: `text` without the code-frame
 * lines that quote the source (numbered lines, whole, cropped or
 * highlighted, in any layout, also inside another tool's box), without the
 * caret markers under them (what a tool prints after its markers is kept),
 * and without the lines quoting `source` (when known) whole, or cropped
 * (each fragment around a `…`/`...` crop marker quoting one line). A name
 * or a cause found in the prose is the diagnostic's, not the user's code.
 */
export function diagnosticProse(text: string, source?: string) {
  const sourceLines = (source ?? '')
    .split(lineTerminator)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const quotesSource = (line: string) => {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      return false
    }
    if (sourceLines.includes(trimmed)) {
      return true
    }
    if (!cropMarker.test(trimmed)) {
      return false
    }
    const fragments = trimmed
      .split(cropMarker)
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length > 0)
    return (
      fragments.length > 0 &&
      sourceLines.some((sourceLine) =>
        fragments.every((fragment) => sourceLine.includes(fragment)),
      )
    )
  }
  const prose: Array<string> = []
  for (const raw of stripVTControlCharacters(text).split(/\r?\n/)) {
    // A frame quoted in another tool's box (`│`) is still a frame.
    const line = raw.replace(/^\s*[│┃]/, '')
    if (numberedFrameLine.test(line)) {
      continue
    }
    const marker = markerLine.exec(line)
    if (marker) {
      const after = line.slice(marker[0].length)
      if (after.trim()) {
        prose.push(after)
      }
      continue
    }
    if (quotesSource(line)) {
      continue
    }
    prose.push(raw)
  }
  return prose.join('\n')
}

// ---------------------------------------------------------------------------
// Reported locations (SPEC J6.5, §5.7, §5.14)

/** A place a tool reports: a file, with a 1-based line and column if any. */
export interface ReportedLocation {
  file: string
  line?: number
  column?: number
}

/** `file:line:column`, `file:line` or a bare `file`, as a tool prints it. */
export function parseLocation(text: string): ReportedLocation {
  const match = /^(.*?)(?::(\d+)(?::(\d+))?)?$/.exec(text.trim())!
  return {
    file: match[1]!,
    ...(match[2] !== undefined && { line: Number(match[2]) }),
    ...(match[3] !== undefined && { column: Number(match[3]) }),
  }
}

/** Oxc's language of a file, by its extension. */
function languageOf(file: string) {
  const extension = /\.([cm]?[jt]sx?)(?:[?#].*)?$/.exec(file)?.[1] ?? 'tsx'
  if (/^[cm]?ts$/.test(extension)) {
    return 'ts' as const
  }
  return extension === 'tsx' ? ('tsx' as const) : ('jsx' as const)
}

/**
 * The 1-based lines of `source` (the module `file`) that a statement or
 * expression importing `specifier` spans: static imports, re-exports
 * (`export … from`) and dynamic `import()`s of exactly that specifier.
 */
export function importLines(
  file: string,
  source: string,
  specifier: string,
): Array<number> {
  const { module } = parseSync(`module.${languageOf(file)}`, source, {
    sourceType: 'module',
  })
  const spans: Array<{ start: number; end: number }> = []
  for (const statement of module.staticImports) {
    if (statement.moduleRequest.value === specifier) {
      spans.push(statement)
    }
  }
  for (const statement of module.staticExports) {
    if (
      statement.entries.some(
        (entry) => entry.moduleRequest?.value === specifier,
      )
    ) {
      spans.push(statement)
    }
  }
  for (const dynamicImport of module.dynamicImports) {
    const request = source.slice(
      dynamicImport.moduleRequest.start,
      dynamicImport.moduleRequest.end,
    )
    if (/^["'`](.*)["'`]$/.exec(request)?.[1] === specifier) {
      spans.push(dynamicImport)
    }
  }
  const lines = new Set<number>()
  for (const { start, end } of spans) {
    const first = diagnosticPosition(source, start).line
    const last = diagnosticPosition(source, Math.max(start, end - 1)).line
    for (let line = first; line <= last; line++) {
      lines.add(line)
    }
  }
  return [...lines].sort((a, b) => a - b)
}

/**
 * The 1-based positions in `source` (the module `file`) of every reference
 * to a binding its static imports of `specifier` introduce (identifiers and
 * JSX names, outside the import statements): the places a use of the
 * import may be reported at, when a test does not name the one genuine use
 * (any reference, type positions included).
 */
export function importedBindingUses(
  file: string,
  source: string,
  specifier: string,
): Array<{ line: number; column: number }> {
  const { module, program } = parseSync(
    `module.${languageOf(file)}`,
    source,
    { sourceType: 'module' },
  )
  const imports = module.staticImports.filter(
    (statement) => statement.moduleRequest.value === specifier,
  )
  const names = new Set(
    imports.flatMap((statement) =>
      statement.entries.map((entry) => entry.localName.value),
    ),
  )
  const inImport = (offset: number) =>
    imports.some(({ start, end }) => offset >= start && offset < end)
  const offsets: Array<number> = []
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (node === null || typeof node !== 'object') {
      return
    }
    const { type, name, start } = node as {
      type?: unknown
      name?: unknown
      start?: unknown
    }
    if (
      (type === 'Identifier' || type === 'JSXIdentifier') &&
      typeof name === 'string' &&
      names.has(name) &&
      typeof start === 'number' &&
      !inImport(start)
    ) {
      offsets.push(start)
    }
    for (const value of Object.values(node)) {
      visit(value)
    }
  }
  if (names.size > 0) {
    visit(program)
  }
  return offsets
    .sort((a, b) => a - b)
    .map((offset) => diagnosticPosition(source, offset))
}

/** The places a reported location may relevantly be (`locationMismatch`). */
export interface RelevantLocation {
  /** The module the report is about (e.g. an importer). */
  file: string
  /** Its original source. */
  source: string
  /** The project root `file` is relative to (see `mentionsFile`). */
  root?: string
  /**
   * The genuine uses the report may point at: 1-based line, and column
   * when one is required (any column of the line otherwise).
   */
  uses?: Array<{ line: number; column?: number }>
  /**
   * Specifiers whose original import may be reported instead of a use:
   * any line, any column, of a statement importing exactly one of them
   * (`importLines`).
   */
  imports?: Array<string>
  /**
   * Other places the caller accepts (e.g. the origin of a marker in the
   * marked module): a file, on one of `lines` (any column), or anywhere in
   * it without `lines`; with `unlocated`, also the file without
   * coordinates.
   */
  others?: Array<{ file: string; lines?: Array<number>; unlocated?: boolean }>
  /**
   * Accept the file without coordinates: only where the location is
   * unavailable (SPEC §5.14, e.g. an import a tool rewrote), never as a
   * blanket escape for source-derived reports.
   */
  unlocated?: boolean
}

/**
 * Why `reported` (`file:line:column`, `file:line` or `file`) is not a
 * relevant place for `expected`, or `undefined` when it is: one of the
 * genuine `uses`, any line of an original import of one of `imports`, one
 * of `others`, or (opt-in) the file without coordinates. The file is named
 * absolute or project-relative (`mentionsFile`, §5.7); the line and the
 * column are 1-based, of the original source, never of compiled code.
 */
export function locationMismatch(
  reported: string,
  expected: RelevantLocation,
): string | undefined {
  const location = parseLocation(reported)
  const names = (file: string) =>
    location.file.length > 0 &&
    mentionsFile(location.file, file, { root: expected.root })
  for (const other of expected.others ?? []) {
    if (
      names(other.file) &&
      (location.line === undefined
        ? other.unlocated === true
        : other.lines === undefined || other.lines.includes(location.line))
    ) {
      return undefined
    }
  }
  if (!names(expected.file)) {
    return `${reported} does not name ${expected.file}`
  }
  if (location.line === undefined) {
    return expected.unlocated
      ? undefined
      : `${reported} has no line (no coordinates are allowed only where the location is unavailable)`
  }
  if (
    location.line < 1 ||
    (location.column !== undefined && location.column < 1)
  ) {
    return `${reported} is not a 1-based original line and column`
  }
  const atUse = (expected.uses ?? []).some(
    (use) =>
      use.line === location.line &&
      (use.column === undefined || use.column === location.column),
  )
  if (atUse) {
    return undefined
  }
  const importAt = (expected.imports ?? []).some((specifier) =>
    importLines(expected.file, expected.source, specifier).includes(
      location.line!,
    ),
  )
  if (importAt) {
    return undefined
  }
  const accepted = [
    ...(expected.uses ?? []).map(
      (use) =>
        `the use at ${use.line}${use.column === undefined ? '' : `:${use.column}`}`,
    ),
    ...(expected.imports ?? []).map(
      (specifier) =>
        `the import of ${specifier} (line ${importLines(expected.file, expected.source, specifier).join(', ') || 'none'})`,
    ),
    ...(expected.others ?? []).map(
      (other) =>
        `${other.file}${other.lines ? `:${other.lines.join('/')}` : ''}`,
    ),
  ]
  return `${reported} is not ${accepted.join(', or ') || 'an accepted place'}`
}

/** Whether `reported` is a relevant place for `expected` (`locationMismatch`). */
export function isRelevantLocation(
  reported: string,
  expected: RelevantLocation,
): boolean {
  return locationMismatch(reported, expected) === undefined
}

/** Asserts that `reported` is a relevant place for `expected` (`locationMismatch`). */
export function expectRelevantLocation(
  reported: string,
  expected: RelevantLocation,
) {
  const mismatch = locationMismatch(reported, expected)
  if (mismatch !== undefined) {
    expect.fail(mismatch)
  }
}

/** A code frame as read from a report: what it highlights and shows. */
export interface ShownFrame {
  /** The 1-based line the frame highlights. */
  line: number
  /** The highlighted line's code from the column its caret points at. */
  pointsAt: string
  /** The code of each line the frame shows, when known. */
  shows?: Array<string>
}

/**
 * Asserts that `frame` shows `source` at `at` (the reported location): it
 * highlights `at.line`, shows that line of the original source, and its
 * caret points at `at.column` (what it shows from the caret on is the
 * source from that column, possibly cropped). How many lines of context
 * it shows, and their layout, are free (SPEC §5.7).
 */
export function expectFrameAt(
  frame: ShownFrame | undefined,
  source: string,
  at: { line: number; column?: number },
) {
  expect(frame, 'a code frame').toBeDefined()
  const sourceLine = source.split(lineTerminator)[at.line - 1] ?? ''
  expect(frame!.line, 'the highlighted line').toBe(at.line)
  if (frame!.shows !== undefined) {
    expect(
      frame!.shows.some(
        (shown) =>
          shown.trimEnd() === sourceLine.trimEnd() ||
          (cropMarker.test(shown) &&
            shown
              .split(cropMarker)
              .every((fragment) => sourceLine.includes(fragment.trim()))),
      ),
      `the frame shows line ${at.line} (${JSON.stringify(sourceLine)}): ${JSON.stringify(frame!.shows)}`,
    ).toBe(true)
  }
  if (at.column !== undefined) {
    const shown = frame!.pointsAt.split(cropMarker)[0]!.trimEnd()
    expect(
      shown.length > 0 && sourceLine.slice(at.column - 1).startsWith(shown),
      `the caret points at column ${at.column} (${JSON.stringify(sourceLine.slice(at.column - 1))}), the frame shows ${JSON.stringify(frame!.pointsAt)}`,
    ).toBe(true)
  }
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
