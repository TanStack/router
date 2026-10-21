/**
 * One diagnostic oracle (FIX-PLAN A9; SPEC G5, J2.8, J4.10, §5.7).
 *
 * Tests capture what the user actually sees (a thrown or rejected error, a
 * bundler's errors and warnings, console output; every channel at once:
 * `./diagnostic-channel`) and assert outcomes only:
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
 *   The console alone: a check that something (or nothing) is reported
 *   reads every channel (`captureDiagnostics` of `./diagnostic-channel`).
 * - `explanationMismatch(diagnostic, prose)`: why a diagnostic is not an
 *   explanation in its own words (`explains`).
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
 *   asymmetric matcher) and `expectEnvRestrictionThrow(run, env)`: J4.10,
 *   read semantically (`restrictedEnvironments`: the message restricts the
 *   call to `env`, in any words; naming the environment is not enough).
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
 * - Position, tied to the named file: the file followed by `:line`,
 *   `:line:column`, `(line,column)` or ` line:column`; a code frame line for
 *   `line` marked with `>` or followed by a `^` marker (the marker gives the
 *   exact column when `source` is known); a bracketed `(line:column)` or
 *   `[line:column]`, or `line <line>` (and `column <column>`), on the same
 *   line as a mention of the file; or a structured `loc` (printed 1-based).
 *   Each spelling counts its column from its own base (see
 *   `reportsPosition`): only where the producer is unknown and tools
 *   disagree (`file:line:column`: Vite and esbuild print 0-based columns,
 *   editors and Rspack 1-based) are both bases read.
 * - Names: each API or option name as a whole identifier, anywhere (only in
 *   `diagnosticProse` with `prose`). A name given as a list is satisfied by
 *   any one of its alternatives.
 * - Causes (`explains`): an explanation in the diagnostic's own words,
 *   any wording: no engine crash, something said beyond the names, paths,
 *   positions and generic failure words, and the input-specific content
 *   that tells the cause apart (`mentions`, e.g. the captured local). An
 *   internal crash that only names the API, or quotes it in a frame, does
 *   not pass. (`causes`, a closed word list, is deprecated: it rejected
 *   equivalent wording.)
 */
import path from 'node:path'
import { realpathSync } from 'node:fs'
import { inspect, stripVTControlCharacters } from 'node:util'
import { parseSync } from 'vite'
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
   * the harness could not tell apart: unrelated work was open, and the text
   * names none of their app roots (or one that several of them claim).
   * Every open capture received it, so it may be another concurrent test's
   * (`./console-hook`).
   */
  shared?: true
  /**
   * The base of the columns of the `file:line:column` spellings in `text`,
   * when the producer is known: `1` once a structured location was printed
   * by `diagnosticsOf` (normalised to 1-based). Unknown (a plain string
   * from an unknown tool): both bases are read, as tools disagree (Vite and
   * esbuild print 0-based columns there, editors and Rspack 1-based).
   */
  columnBase?: 0 | 1
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
   * @deprecated A closed vocabulary: at least one of these words
   * (case-insensitive, at word starts) or patterns must appear in the
   * prose. It rejects an equivalent explanation in other words (EMPIRICAL
   * R5: "has to be stored in a variable" failed a placement list). Use
   * `explains`, which judges content, not wording.
   */
  causes?: Array<string | RegExp>
  /**
   * The diagnostic must explain a cause in its own words, whatever the
   * wording (SPEC G5, §5.7; `explanationMismatch`): it is no engine crash
   * (a `TypeError`, `Cannot read properties of undefined`, ...), and its
   * prose (`diagnosticProse`, quoted source left out) says something beyond
   * the names it gives, file paths, positions, tool tags and generic
   * failure words ("internal error", "failed to compile"). `mentions`: what
   * from the user's input the explanation must name in its own words (a
   * list: any one of its alternatives), e.g. the local a handler captures:
   * the content that tells this cause from another.
   */
  explains?: true | { mentions?: Array<string | Array<string>> }
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
    {
      severity,
      text: describe(record),
      raw: value,
      ...(hasStructuredColumn(record) && { columnBase: 1 as const }),
    },
    ...diagnosticsOf(warnings, 'warning'),
  ]
}

/** Whether `describe` prints a structured location with a column for it. */
function hasStructuredColumn(record: Record<string, unknown>) {
  const loc = record.loc ?? record.location
  return (
    typeof loc === 'object' &&
    loc !== null &&
    typeof (loc as { line?: unknown }).line === 'number' &&
    typeof (loc as { column?: unknown }).column === 'number'
  )
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
      diagnostic,
      expected.position,
      fileMentions,
      expected.source,
      expected.file !== undefined,
    )
  ) {
    const { line, column } = expected.position
    reasons.push(
      `does not report line ${line}${column === undefined ? '' : `, column ${column}`}`,
    )
  }
  const prose =
    expected.prose ||
    expected.causes !== undefined ||
    expected.explains !== undefined
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
  if (expected.explains !== undefined) {
    const mismatch = explanationMismatch(diagnostic, prose, {
      names: [
        ...(expected.names ?? []),
        ...(expected.explains === true
          ? []
          : (expected.explains.mentions ?? [])),
      ],
    })
    if (mismatch !== undefined) {
      reasons.push(mismatch)
    }
    for (const mention of expected.explains === true
      ? []
      : (expected.explains.mentions ?? [])) {
      const alternatives = ([] as Array<string>).concat(mention)
      if (
        !alternatives.some((alternative) => namesIdentifier(prose, alternative))
      ) {
        reasons.push(
          `does not name ${alternatives.map((alternative) => `\`${alternative}\``).join(' or ')} in its explanation`,
        )
      }
    }
  }
  return reasons
}

/** Error classes the engine throws when code crashes. */
const crashClasses = new Set(['TypeError', 'ReferenceError', 'RangeError'])

/** What an engine prints when code crashes (V8, JavaScriptCore, SpiderMonkey). */
const crashSignatures = [
  /\bcannot read propert(?:y|ies) of (?:undefined|null)\b/i,
  /\bcannot set propert(?:y|ies) of (?:undefined|null)\b/i,
  /\bcannot destructure\b/i,
  /\bis not a (?:function|constructor)\b/i,
  /\bis not iterable\b/i,
  /\bis not defined\b/i,
  /\bundefined is not an object\b/i,
  /\bcannot access '[^']*' before initialization\b/i,
  /\bmaximum call stack size exceeded\b/i,
  /\b(?:TypeError|ReferenceError|RangeError):/,
]

/**
 * Words that say only that something failed, not why: an explanation must
 * say more than these (and than the names, paths and positions it gives).
 */
const genericFailureWords = new Set(
  `a an the of in at on to for from by with while during when and or it its this that
  is was be been being are were has have had
  error errors failed fail fails failure failing internal unexpected unexpectedly unknown
  exception crash crashed occurred happened went wrong something could not unable
  compile compiling compiled compiler compilation transform transforming transformed
  transformation process processing processed plugin vite rollup rolldown webpack
  rspack rsbuild esbuild babel oxc build building module file line column code
  warning warn info note see details`
    .split(/\s+/)
    .filter(Boolean),
)

/**
 * Why a diagnostic is not an explanation in its own words (see
 * `DiagnosticExpectation.explains`), or `undefined` when it is. `prose` is
 * its text without quoted source; `names` the identifiers it is expected
 * to give (they do not count as explanation).
 */
export function explanationMismatch(
  diagnostic: Pick<Diagnostic, 'text' | 'raw'>,
  prose: string,
  options: { names?: Array<string | Array<string>> } = {},
): string | undefined {
  const raw = diagnostic.raw as { name?: unknown } | null
  if (
    raw !== null &&
    typeof raw === 'object' &&
    typeof raw.name === 'string' &&
    crashClasses.has(raw.name)
  ) {
    return `is an engine crash (${raw.name}), not an explanation`
  }
  const crash = crashSignatures.find((signature) => signature.test(prose))
  if (crash) {
    return `reads as an engine crash (${crash}), not an explanation`
  }
  const names = new Set(
    (options.names ?? []).flatMap((name) => ([] as Array<string>).concat(name)),
  )
  const words =
    prose
      // Stack frames are not prose
      .replace(/^\s*at .*$/gm, ' ')
      // Tool tags such as `[plugin:vite:x]` or `[import-protection]`
      .replace(/\[[^\]\n]*\]/g, ' ')
      // Quoted code: the user's, not the diagnostic's words
      .replace(/`[^`\n]*`|"[^"\n]*"|(?<!\w)'[^'\n]*'(?!\w)/g, ' ')
      // Paths, URLs and positions
      .replace(/\S*[\\/]\S*/g, ' ')
      .replace(/\b[\w-]+\.[cm]?[jt]sx?\b\S*/g, ' ')
      .replace(/\d+(?::\d+)*/g, ' ')
      .match(/[A-Za-z][\w$'-]*/g) ?? []
  const own = words.filter(
    (word) =>
      word.length > 1 &&
      !names.has(word) &&
      !genericFailureWords.has(word.toLowerCase()) &&
      // Code, not words: `serverFn`, `__x`, `$lang`, `x1`
      !/[a-z][A-Z]|[_$\d]/.test(word),
  )
  if (own.length < 1) {
    return `does not explain a cause in its own words (it says: ${JSON.stringify(prose.trim().slice(0, 160))})`
  }
  return undefined
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

/**
 * The base a spelling's column is counted from: `0`, `1`, or `either` where
 * tools disagree and the producer is unknown (see `Diagnostic.columnBase`).
 */
type ColumnBase = 0 | 1 | 'either'

function columnMatches(
  reported: number,
  column: number | undefined,
  base: ColumnBase,
) {
  return (
    column === undefined ||
    (base !== 0 && reported === column) ||
    (base !== 1 && reported === column - 1)
  )
}

/**
 * Whether `text` reports `position` in a spelling tied to the named file
 * (see the file header): the file followed by its position; a bracketed
 * position or a `line N` phrase on the same line as a mention of the file
 * (when a file is expected; anywhere otherwise); or a code frame marking
 * the line (a frame quotes the reported file). Each spelling counts its
 * column from its own base: `(line,column)` (TypeScript) from 1, Babel's
 * `(line:column)` and webpack's `line:column-column` from 0, a caret under
 * the quoted source exactly, and `file:line:column`, ` line:column`,
 * `[line:column]` (miette, which SWC fills 0-based) and `line N, column M`
 * from the producer's base when known (`Diagnostic.columnBase`), from
 * either base otherwise.
 */
function reportsPosition(
  diagnostic: Pick<Diagnostic, 'text' | 'columnBase'>,
  position: { line: number; column?: number },
  fileMentions: Array<{ end: number }>,
  source: string | undefined,
  fileExpected: boolean,
) {
  const { text } = diagnostic
  const { line, column } = position
  const producerBase: ColumnBase = diagnostic.columnBase ?? 'either'
  // The file followed by its position.
  for (const { end } of fileMentions) {
    const after = text.slice(end, end + 24)
    const suffix =
      /^(?::(\d+)(?::(\d+))?|\((\d+),(\d+)\)| (\d+):(\d+)(-\d+)?)/.exec(after)
    if (suffix) {
      const reportedLine = Number(suffix[1] ?? suffix[3] ?? suffix[5])
      const reportedColumn = suffix[2] ?? suffix[4] ?? suffix[6]
      const base: ColumnBase =
        suffix[4] !== undefined ? 1 : suffix[7] !== undefined ? 0 : producerBase
      if (
        reportedLine === line &&
        (column === undefined ||
          (reportedColumn !== undefined &&
            columnMatches(Number(reportedColumn), column, base)))
      ) {
        return true
      }
    }
  }
  /** Whether the offset is on a line of `text` that names the file. */
  const besideFile = (offset: number, linesBefore = 0) => {
    if (!fileExpected) {
      return true
    }
    let lineStart = text.lastIndexOf('\n', offset - 1) + 1
    // A report's header line may name the file a few lines above its frame
    for (let line = 0; line < linesBefore && lineStart > 0; line++) {
      lineStart = text.lastIndexOf('\n', lineStart - 2) + 1
    }
    const nextBreak = text.indexOf('\n', offset)
    const lineEnd = nextBreak === -1 ? text.length : nextBreak
    return fileMentions.some(({ end }) => end > lineStart && end <= lineEnd + 1)
  }
  // A bracketed `(line:column)` (Babel, 0-based column) or `[line:column]`
  // (a miette frame header: SWC prints a 0-based column there, miette's own
  // reports a 1-based one).
  for (const match of text.matchAll(/([([])(\d+):(\d+)[)\]]/g)) {
    if (
      Number(match[2]) === line &&
      columnMatches(
        Number(match[3]),
        column,
        match[1] === '(' ? 0 : producerBase,
      ) &&
      // A miette frame header sits below the report line naming the file
      besideFile(match.index, match[1] === '[' ? 3 : 0)
    ) {
      return true
    }
  }
  // `line 12` (and `column 5`), beside the file.
  for (const match of text.matchAll(
    new RegExp(`\\bline:?\\s+${line}\\b`, 'gi'),
  )) {
    if (!besideFile(match.index)) {
      continue
    }
    if (column === undefined) {
      return true
    }
    const lineEnd = text.indexOf('\n', match.index)
    const rest = text.slice(match.index, lineEnd === -1 ? text.length : lineEnd)
    const columnMatch = /\bcol(?:umn)?:?\s+(\d+)\b/i.exec(rest)
    if (
      columnMatch &&
      columnMatches(Number(columnMatch[1]), column, producerBase)
    ) {
      return true
    }
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
    // The caret, or one column left of it: a compiler handing a 0-based
    // AST column to a 1-based code-frame API (Babel's `codeFrameColumns`)
    // draws it there. Start's `codeFrameError` does today; keep the tolerance
    // for the caret only.
    if (start >= 0 && columnMatches(caret - start + 1, column, 'either')) {
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
 * to a binding its static imports of `specifier` introduce, in code that
 * runs: identifiers and JSX names outside the import statements, except
 * type positions (erased: annotations, `typeof` types, type declarations,
 * `declare`d code, `implements`) and names a local binding of the same name
 * shadows. The places a use of the import may be reported at, when a test
 * does not name the one genuine use. Uses in code a compiler removes (a
 * server function's handler body…) are not told apart: tests of those name
 * the genuine use.
 */
export function importedBindingUses(
  file: string,
  source: string,
  specifier: string,
): Array<{ line: number; column: number }> {
  const { module, program } = parseSync(`module.${languageOf(file)}`, source, {
    sourceType: 'module',
  })
  const names = new Set(
    module.staticImports
      .filter((statement) => statement.moduleRequest.value === specifier)
      .flatMap((statement) =>
        statement.entries.map((entry) => entry.localName.value),
      ),
  )
  const offsets: Array<number> = []
  /** Each enclosing scope's own bindings of the imported names. */
  const scopes: Array<Set<string>> = []
  const visit = (node: unknown, parent?: AstNode, key?: string) => {
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, parent, key))
      return
    }
    if (!isAstNode(node) || referencesNoBinding(node)) {
      return
    }
    if (
      (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
      typeof node.name === 'string' &&
      names.has(node.name) &&
      !(parent && key !== undefined && isNameOnly(node, parent, key)) &&
      !scopes.some((scope) => scope.has(node.name as string))
    ) {
      offsets.push(node.start)
    }
    const scope = scopeBindings(node, names)
    if (scope) {
      scopes.push(scope)
    }
    for (const [childKey, child] of Object.entries(node)) {
      if (!typeOnlyKeys.has(childKey)) {
        visit(child, node, childKey)
      }
    }
    if (scope) {
      scopes.pop()
    }
  }
  if (names.size > 0) {
    visit(program)
  }
  return offsets
    .sort((a, b) => a - b)
    .map((offset) => diagnosticPosition(source, offset))
}

/** An ESTree / TS-ESTree node, as Oxc gives it. */
type AstNode = { type: string; start: number; [key: string]: unknown }

function isAstNode(value: unknown): value is AstNode {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { type?: unknown }).type === 'string' &&
    typeof (value as { start?: unknown }).start === 'number'
  )
}

/** Keys of TS-ESTree nodes that hold only types. */
const typeOnlyKeys = new Set([
  'typeAnnotation',
  'typeParameters',
  'typeArguments',
  'returnType',
  'superTypeArguments',
  'implements',
])

/** The TS-ESTree nodes that hold runtime code; every other `TS…` is a type. */
const runtimeTsNodes = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
  'TSParameterProperty',
  'TSEnumDeclaration',
  'TSEnumBody',
  'TSEnumMember',
  'TSModuleDeclaration',
  'TSModuleBlock',
  'TSExportAssignment',
  'TSImportEqualsDeclaration',
  'TSExternalModuleReference',
  'TSQualifiedName',
])

/**
 * Code that references no binding of the module: code that compiling to
 * JavaScript erases, import statements and re-exports from another module.
 */
function referencesNoBinding(node: AstNode) {
  return (
    (node.type.startsWith('TS') && !runtimeTsNodes.has(node.type)) ||
    node.declare === true ||
    node.exportKind === 'type' ||
    node.importKind === 'type' ||
    node.type === 'ImportDeclaration' ||
    ((node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration') &&
      isAstNode(node.source))
  )
}

/**
 * Whether `node` (an identifier, the `key` child of `parent`) is a name
 * rather than a reference to a binding: a property or member name, a
 * label, an exported name, a JSX attribute or intrinsic element name.
 */
function isNameOnly(node: AstNode, parent: AstNode, key: string) {
  switch (parent.type) {
    case 'MemberExpression':
      return key === 'property' && parent.computed !== true
    case 'Property':
    case 'MethodDefinition':
    case 'PropertyDefinition':
    case 'AccessorProperty':
      return key === 'key' && parent.computed !== true
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return key === 'label'
    case 'ExportSpecifier':
    case 'ExportAllDeclaration':
      return key === 'exported'
    case 'MetaProperty':
    case 'JSXAttribute':
    case 'JSXNamespacedName':
    case 'ImportAttribute':
      return true
    case 'TSEnumMember':
      return key === 'id'
    case 'TSQualifiedName':
    case 'JSXMemberExpression':
      return key === 'right' || key === 'property'
    case 'JSXOpeningElement':
    case 'JSXClosingElement':
      // `<div>` names an intrinsic element, not a binding
      return /^[a-z]/.test(String(node.name))
    default:
      return false
  }
}

/**
 * The imported `names` that `node`, when it opens a scope, binds itself
 * (shadowing the import inside it), or `undefined` when it opens none.
 */
function scopeBindings(
  node: AstNode,
  names: Set<string>,
): Set<string> | undefined {
  const bound: Array<string> = []
  switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      if (node.type === 'FunctionExpression') {
        patternNames(node.id, bound)
      }
      patternNames(node.params, bound)
      varNames(node.body, bound)
      break
    case 'ClassExpression':
      patternNames(node.id, bound)
      break
    case 'CatchClause':
      patternNames(node.param, bound)
      break
    case 'BlockStatement':
    case 'StaticBlock':
    case 'TSModuleBlock':
      lexicalNames(node.body, bound)
      if (node.type === 'StaticBlock') {
        varNames(node.body, bound)
      }
      break
    case 'SwitchStatement':
      lexicalNames(
        (node.cases as Array<{ consequent: Array<unknown> }>).flatMap(
          (switchCase) => switchCase.consequent,
        ),
        bound,
      )
      break
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
      lexicalNames(
        [node.type === 'ForStatement' ? node.init : node.left],
        bound,
      )
      break
    default:
      return undefined
  }
  return new Set(bound.filter((name) => names.has(name)))
}

/** The names a binding pattern (or a list of them, e.g. parameters) binds. */
function patternNames(pattern: unknown, out: Array<string>) {
  if (Array.isArray(pattern)) {
    pattern.forEach((element) => patternNames(element, out))
    return
  }
  if (!isAstNode(pattern)) {
    return
  }
  switch (pattern.type) {
    case 'Identifier':
      out.push(pattern.name as string)
      break
    case 'ObjectPattern':
      for (const property of pattern.properties as Array<AstNode>) {
        patternNames(
          property.type === 'RestElement' ? property.argument : property.value,
          out,
        )
      }
      break
    case 'ArrayPattern':
      patternNames(pattern.elements, out)
      break
    case 'AssignmentPattern':
      patternNames(pattern.left, out)
      break
    case 'RestElement':
      patternNames(pattern.argument, out)
      break
    case 'TSParameterProperty':
      patternNames(pattern.parameter, out)
      break
  }
}

/**
 * The names the statements of a block bind in it: `let`, `const`, `using`,
 * classes, functions, enums, namespaces and `import x =` aliases.
 */
function lexicalNames(statements: unknown, out: Array<string>) {
  for (const statement of Array.isArray(statements) ? statements : []) {
    const declaration =
      isAstNode(statement) &&
      (statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportDefaultDeclaration')
        ? statement.declaration
        : statement
    if (!isAstNode(declaration)) {
      continue
    }
    if (declaration.type === 'VariableDeclaration') {
      if (declaration.kind !== 'var') {
        for (const declarator of declaration.declarations as Array<AstNode>) {
          patternNames(declarator.id, out)
        }
      }
    } else if (
      declaration.type === 'ClassDeclaration' ||
      declaration.type === 'FunctionDeclaration' ||
      declaration.type === 'TSEnumDeclaration' ||
      declaration.type === 'TSModuleDeclaration' ||
      declaration.type === 'TSImportEqualsDeclaration'
    ) {
      patternNames(declaration.id, out)
    }
  }
}

/** The `var` names a function body binds (outside nested functions). */
function varNames(node: unknown, out: Array<string>) {
  if (Array.isArray(node)) {
    node.forEach((child) => varNames(child, out))
    return
  }
  if (
    !isAstNode(node) ||
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'StaticBlock'
  ) {
    return
  }
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    for (const declarator of node.declarations as Array<AstNode>) {
      patternNames(declarator.id, out)
    }
  }
  for (const child of Object.values(node)) {
    varNames(child, out)
  }
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

/** How a message names each environment, as a whole word. */
const environmentWords: Record<Environment, RegExp> = {
  server: /\bserver(?:[- ]side)?\b/gi,
  client: /\b(?:client(?:[- ]side)?|browser)\b/gi,
}

const otherEnvironment = (env: Environment): Environment =>
  env === 'server' ? 'client' : 'server'

/** Errors the engine throws when code crashes, not deliberate errors. */
const engineErrors = new Set([
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
])

/**
 * A use limited to what follows, before a mention of an environment in its
 * sentence ("can only be called on", "is restricted to", "move this call
 * to").
 */
const restrictingUse =
  // (`only` of a compound such as `server-only` modifies its own word)
  /\b(?:(?<!-)only|restricted|limited|reserved|exclusive(?:ly)?|move[sd]?\b[^,]*\bto)\b/i

/** A negated use, before a mention of an environment in its sentence. */
const negatedUse =
  /\b(?:cannot|can't|can ?not|must ?not|mustn't|may ?not|should ?not|never|not (?:be )?(?:available|allowed|supported|permitted|callable|accessible|usable|runnable)|unavailable|disallowed|forbidden|prohibited)\b/i

/** The index of the last match of `pattern` in `text`, or -1. */
function lastMatch(pattern: RegExp, text: string) {
  let last = -1
  for (const match of text.matchAll(new RegExp(pattern.source, 'gi'))) {
    last = match.index
  }
  return last
}

/**
 * The environments a message restricts a call to, read from how it names
 * each one (J4.10; the wording is free, SPEC §5.7), sentence by sentence:
 * - allowed: `X-only` / `X only`, or a limited use before the mention in
 *   its sentence ("can only be called on the server", "only available in
 *   the browser", "restricted to the server", "move this call to the
 *   server");
 * - forbidden: a negated use before the mention in its sentence ("cannot
 *   be called on the client", "is not available in the browser", "must
 *   not run on the server"), which restricts the call to the other
 *   environment.
 * A mention in a sentence that says neither ("server function not found")
 * restricts nothing.
 */
export function restrictedEnvironments(message: string): Set<Environment> {
  const restricted = new Set<Environment>()
  const sentences = stripVTControlCharacters(message).split(/[.!?;\n]+/)
  for (const sentence of sentences) {
    for (const env of ['server', 'client'] as const) {
      for (const match of sentence.matchAll(environmentWords[env])) {
        const before = sentence.slice(0, match.index)
        const after = sentence.slice(match.index + match[0].length)
        if (/^\s*-?\s*only\b/i.test(after)) {
          restricted.add(env)
          continue
        }
        // The cue nearest the mention decides ("cannot call a server-only
        // function on the client": `cannot` governs the client)
        const restricting = lastMatch(restrictingUse, before)
        const negated = lastMatch(negatedUse, before)
        if (negated > restricting) {
          restricted.add(otherEnvironment(env))
        } else if (restricting > negated) {
          restricted.add(env)
        }
      }
    }
  }
  return restricted
}

/**
 * Whether `error` is a deliberate error (not an engine `TypeError`,
 * `ReferenceError`, …) whose message restricts the called function to the
 * environment `env` (`client` may be called `browser`) and not to the other
 * one (`restrictedEnvironments`). The prose is free (SPEC §5.7, J4.10); a
 * message that only names the environment ("server function not found")
 * or restricts the call to the other one does not identify the restriction.
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
  const restricted = restrictedEnvironments(message)
  return restricted.has(env) && !restricted.has(otherEnvironment(env))
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
