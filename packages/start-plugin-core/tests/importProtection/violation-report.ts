/**
 * Reads the import-protection violation reports a user sees by their
 * content (SPEC J6.5), not by their wording or layout (J6.12, §5.7; coupling
 * N15-N17, RULES-AUDIT R18): the environment type the report is about, the
 * importer's `file:line:column`, the raw specifier, the resolved file, the
 * import chain from an entry to the importer, the code frame (its `>`/`^`
 * convention, J6.12) and the suggestions.
 *
 * Nothing here depends on a label word, a section order, a numbering style,
 * quotes or an entry marker. A report is a block of a diagnostic's text that
 * starts at an unindented line naming an environment type (or announcing
 * import protection); its parts are told apart by what they hold:
 * - `label <separator> value` lines (`:`, `->`, `=`, ...): a value that is a
 *   whole quoted string is the specifier; a value that is a file (with or
 *   without `:line:column`) is the importer, or the resolved file when it is
 *   what the specifier resolves to;
 * - list items (`1.`, `#1`, `[1/3]`, `-`, `*`) that start with a file are
 *   the steps of the import chain, each naming the specifier it imports
 *   with (any quoted string after the file); the chain is read from the
 *   entry to the importer whichever way it is printed (the end that is the
 *   importer tells the direction; SPEC J6.5, ruling 2026-10-21 R10);
 * - other list items are the suggestions;
 * - `>`/`|`/`^` lines are the code frame, and a bare location after it the
 *   location it shows.
 * A block that announces import protection but whose importer or specifier
 * cannot be found throws, so that a check that nothing is reported cannot
 * pass on a report it failed to read.
 *
 * What is read: every channel (SPEC §5.7). Pass a dev server (`DevServer`,
 * `RsbuildDevServer`), a build (`StartBuild`) or a failed build
 * (`StartBuildError`): their `diagnostics` hold everything they reported, on
 * the console, the process streams, Vite's logger and the bundler, and their
 * `root` makes absolute paths relative. Log lines, texts and errors are read
 * too. `inEnvironment(output, 'client')` keeps the reports about one
 * environment type (a build's console is shared by its environments; each
 * report names its own, J6.5).
 *
 * `onViolation` gives the same violations structured (`ViolationInfo`);
 * tests that need the user-visible text (what is logged, how often, the
 * displayed chain and frame) read it through this reader.
 */
import path from 'node:path'
import { parseSync } from 'vite'
import { expect } from 'vitest'
import {
  diagnosticsOf,
  expectFrameAt,
  findDiagnostics,
  importLines,
  importedBindingUses,
  isRelevantLocation,
  parseLocation,
} from '@tanstack/compiler-test-utils/diagnostics'
import type { RelevantLocation } from '@tanstack/compiler-test-utils/diagnostics'

export interface ReportedViolation {
  /** `client` or `server`. */
  environment: string
  /**
   * Where the violation is reported: the importer relative to the app root,
   * with `:line:column` when the report has a location.
   */
  importer: string
}

export interface ReportedTraceStep {
  /** The module, as `file:line:column` when the step has a location. */
  at: string
  /** The specifier the step imports the next step with. */
  imports?: string
}

export interface ReportedCodeFrame {
  /** The line number the frame highlights. */
  line: number
  /** The highlighted line's code from the column the caret points at. */
  pointsAt: string
  /** The code of each line the frame shows. */
  shows: Array<string>
  /** The location printed with the frame (`''` when none). */
  location: string
}

export interface ViolationReport extends ReportedViolation {
  /** The raw specifier. */
  specifier: string
  /** The resolved file, relative to the app root, when the report names it. */
  resolved?: string
  /**
   * The import chain, from the entry (`trace[0]`) to the importer, however
   * the report prints it.
   */
  trace: Array<ReportedTraceStep>
  code?: ReportedCodeFrame
  /** The suggestions (the report's prose list items). */
  suggestions: Array<string>
  /** The whole report. */
  text: string
}

// ---------------------------------------------------------------------------
// What is read

/**
 * What the reports are read from: a dev server, a build or a failed build
 * (their `diagnostics`: every channel), log entries, a text, an error, or
 * anything `diagnosticsOf` reads, each diagnostic's text on its own;
 * `inEnvironment()` of any of these.
 */
export type ReportOutput = string | Array<string> | unknown

const environmentFilter = Symbol('environment filter')

interface EnvironmentFilter {
  [environmentFilter]: { output: ReportOutput; environment: string }
}

/**
 * `output` with only the reports about the environment type `environment`
 * (`client` or `server`, as the report names it).
 */
export function inEnvironment(
  output: ReportOutput,
  environment: 'client' | 'server',
): EnvironmentFilter {
  return { [environmentFilter]: { output, environment } }
}

/** The texts of `output` and the root its absolute paths are under. */
function textsOf(output: ReportOutput): {
  texts: Array<string>
  root?: string
} {
  if (typeof output === 'string') {
    return { texts: [output] }
  }
  if (Array.isArray(output)) {
    const parts = output.map(textsOf)
    return {
      texts: parts.flatMap(({ texts }) => texts),
      root: parts.find(({ root }) => root)?.root,
    }
  }
  if (typeof output === 'object' && output !== null) {
    const record = output as { diagnostics?: unknown; root?: unknown }
    const root = typeof record.root === 'string' ? record.root : undefined
    if (Array.isArray(record.diagnostics)) {
      // A report is a warning or an error (SPEC J6.3 "warn"; coordinator
      // ruling 2026-10-21, diagnostic severity): an info line is no report,
      // whatever it says
      return {
        texts: record.diagnostics
          .filter(
            (diagnostic: { severity?: unknown }) =>
              diagnostic.severity === undefined ||
              diagnostic.severity === 'warning' ||
              diagnostic.severity === 'error',
          )
          .map((diagnostic: { text?: unknown }) =>
            String(diagnostic.text ?? diagnostic),
          ),
        root,
      }
    }
  }
  return { texts: diagnosticsOf(output).map(({ text }) => text) }
}

// ---------------------------------------------------------------------------
// Lines

const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/** A file reference: a path with an extension, maybe `:line:column`. */
const fileSource = String.raw`(?:[A-Za-z]:[\\/]|[a-z]+:\/\/?|\.{0,2}\/)?(?:[\w@.+~$%#-]+[\\/])*[\w@.+~$%#-]*\.[A-Za-z][A-Za-z0-9]*(?::\d+(?::\d+)?)?`
const fileAtStart = new RegExp(`^(${fileSource})(?=$|[\\s,;)\\]])`)
const wholeFile = new RegExp(`^${fileSource}$`)

/** A string between matching quotes. */
const quoted = /(["'`])((?:(?!\1).)+)\1/

/** `label <separator> value` (the separator: `:`, `->`, `=>`, `=`, a dash). */
function fieldOf(line: string): { label: string; value: string } | undefined {
  const match =
    /^\s*([A-Za-z][\w ()'/-]{0,48}?)\s*(?::|->|=>|=|—|–)(?:\s+(.*?))?\s*$/.exec(
      line,
    )
  if (!match || /^\w*(Error|Warning)$/.test(match[1]!.trim())) {
    return undefined
  }
  return { label: match[1]!.trim(), value: match[2] ?? '' }
}

/** A list item (`1.`, `1)`, `#1`, `[1]`, `[1/3]`, `-`, `*`, `•`): its content. */
function listItemOf(line: string): string | undefined {
  return /^\s*(?:\d+[.)]|#\d+[.:)]?|\[\d+(?:\/\d+)?\]|\(\d+\)|[-*•])\s+(.*\S)\s*$/.exec(
    line,
  )?.[1]
}

const isFrameLine = (line: string) =>
  /^\s*>?\s*\d+\s*\|/.test(line) || /^\s*\|[\s^~]*$/.test(line)

const isBareLocation = (line: string) => wholeFile.test(line.trim())

const indentOf = (line: string) => /^\s*/.exec(line)![0].length

/** The environment types a text names, as whole words. */
function environmentWords(text: string): Array<'client' | 'server'> {
  return [
    ...new Set(
      (text.match(/\b(client|server)\b/gi) ?? []).map(
        (word) => word.toLowerCase() as 'client' | 'server',
      ),
    ),
  ]
}

const announcesImportProtection = (text: string) =>
  /import[- ]?protection/i.test(text)

/**
 * Whether `line` starts a report: unindented, naming an environment type or
 * announcing import protection, and none of a report's parts (a field with
 * a one- or two-word value, a list item, a frame line, a location).
 */
function startsReport(line: string): boolean {
  if (line.trim() === '' || indentOf(line) > 0) {
    return false
  }
  if (listItemOf(line) !== undefined || isFrameLine(line)) {
    return false
  }
  if (isBareLocation(line)) {
    return false
  }
  const field = fieldOf(line)
  if (field && field.value.trim().split(/\s+/).length <= 2) {
    return false
  }
  return environmentWords(line).length > 0 || announcesImportProtection(line)
}

/** The candidate report blocks of a text, each from a line that starts one. */
function blocks(text: string): Array<Array<string>> {
  const boxed = text
    // Rsbuild boxes the lines of an error with `│`
    .replace(/^.*│ ?/gm, '')
    .replace(ansi, '')
    .split('\n')
  // A text indented as a whole (a tool's own indentation) is read as if it
  // was not
  const margin = Math.min(
    ...boxed.filter((line) => line.trim() !== '').map(indentOf),
  )
  const lines = Number.isFinite(margin)
    ? boxed.map((line) => line.slice(Math.min(margin, indentOf(line))))
    : boxed
  const result: Array<Array<string>> = []
  let current: Array<string> | undefined
  for (const line of lines) {
    if (startsReport(line)) {
      current = []
      result.push(current)
    }
    current?.push(line)
  }
  return result
}

// ---------------------------------------------------------------------------
// One report

/** A path as the tests name it: relative to `root` when under it. */
function relativeTo(root: string | undefined, file: string): string {
  const location = /^(.*?)((?::\d+){0,2})$/.exec(file)!
  let name = location[1]!
  if (root && path.isAbsolute(name)) {
    const relative = path.relative(root, name)
    if (!relative.startsWith('..')) {
      name = relative.split(path.sep).join('/')
    }
  }
  return name + location[2]
}

const withoutLocation = (file: string) => parseLocation(file).file
const withoutExtension = (file: string) => file.replace(/\.[^./]+$/, '')

/** Whether `file` is what `specifier` imported from `importer` resolves to. */
function resolvesTo(
  specifier: string,
  importer: string,
  file: string,
  { aliases = true }: { aliases?: boolean } = {},
) {
  const target = withoutExtension(withoutLocation(file))
  if (specifier.startsWith('.')) {
    const joined = path.posix.join(
      path.posix.dirname(withoutLocation(importer)),
      specifier,
    )
    // (the specifier may name the file with or without its extension)
    return joined === target || joined === withoutLocation(file)
  }
  // A package's file (a dependency, or outside the app), or an aliased path
  // ending with the specifier's segments (`~/lib/x` -> `src/lib/x.ts`)
  return (
    /(^|\/)node_modules\//.test(file) ||
    path.isAbsolute(withoutLocation(file)) ||
    (aliases &&
      `/${target}`.endsWith(
        `/${withoutExtension(specifier.replace(/^[#~@]+\/?/, ''))}`,
      ))
  )
}

/**
 * Whether `file` is what `specifier` names, from whichever importer: the
 * same file name for a relative specifier, a dependency's file for a
 * package one.
 */
function namesTarget(specifier: string, file: string) {
  const base = path.posix.basename(withoutLocation(file))
  if (specifier.startsWith('.')) {
    // (with or without its extension)
    const named = path.posix.basename(specifier)
    return named === base || named === withoutExtension(base)
  }
  return (
    /(^|\/)node_modules\//.test(file) ||
    withoutExtension(withoutLocation(file)).endsWith(
      withoutExtension(specifier.replace(/^[#~@]+\/?/, '')),
    )
  )
}

/**
 * An operation running code performs on a value (the traps of a mock): a
 * call, a construction, a member read or write, a primitive conversion.
 */
const isMockAccess = (value: string) =>
  /(?:^|[\s(])(?:call|construct|apply|get|set|has|toPrimitive|toString|valueOf|toJSON)(?:$|[\s)])/.test(
    value,
  ) && /\w(?:\(\)|\.\w)|\bnew \w/.test(value)

/**
 * The environment type a report is about: the one its header names; when
 * it names both ("client code cannot import a server module"), the one it
 * names as the environment (`X environment`, `in the X`, `X side`, `X
 * bundle`) or as the subject that cannot import.
 */
function environmentOf(header: string): string | undefined {
  const named = environmentWords(header)
  if (named.length <= 1) {
    return named[0]
  }
  const qualifies = (env: string) =>
    new RegExp(
      `\\b${env}[- ]?(?:environment|env|side|bundle|build|runtime)\\b|\\b(?:in|into|for|from) (?:the )?${env}\\b|\\b${env}\\b[^.,;]*\\b(?:cannot|can't|must not|may not|is not allowed to|should not) (?:import|use|load)`,
      'i',
    ).test(header)
  const environments = named.filter(qualifies)
  return environments.length === 1 ? environments[0] : undefined
}

/**
 * Parses one candidate block: `undefined` for a block that is no
 * import-protection report (another diagnostic); throws for a block that
 * announces import protection without an importer and a specifier.
 */
function parseReport(
  block: Array<string>,
  root: string | undefined,
): ViolationReport | undefined {
  const text = block.join('\n')
  const header = block[0]!
  const body = block.slice(1)
  const fields = body
    .filter((line) => !isFrameLine(line) && listItemOf(line) === undefined)
    .flatMap((line) => fieldOf(line) ?? [])
  const items = body.flatMap((line) => listItemOf(line) ?? [])

  // The specifier: a field whose value is one quoted string
  const specifierField = fields.find(({ value }) =>
    new RegExp(`^${quoted.source}$`).test(value),
  )
  const specifier = specifierField
    ? quoted.exec(specifierField.value)![2]!
    : undefined

  // Files: the importer, and the resolved file
  const files = fields
    .filter((field) => field !== specifierField)
    .flatMap(({ value }) => {
      const match = fileAtStart.exec(value)
      return match && value.slice(match[0].length).trim() === ''
        ? [relativeTo(root, match[1]!)]
        : []
    })

  // The chain: list items that start with a file
  const steps = items.flatMap((item) => {
    const match = fileAtStart.exec(item)
    if (!match) {
      return []
    }
    const imported = quoted.exec(item.slice(match[0].length))?.[2]
    return [
      {
        at: relativeTo(root, match[1]!),
        ...(imported !== undefined && { imports: imported }),
      },
    ]
  })
  const suggestions = items.filter((item) => !fileAtStart.test(item))

  let importer: string | undefined
  let resolved: string | undefined
  if (files.length === 1) {
    // The one file is the importer, unless it is what the specifier names
    if (specifier !== undefined && namesTarget(specifier, files[0]!)) {
      resolved = files[0]
    } else {
      importer = files[0]
    }
  } else if (files.length > 1) {
    // (a package's file before an aliased app file, and a file without a
    // location first: the importer has one when the report locates it)
    const ordered = [...files].sort(
      (a, b) => Number(/:\d+/.test(a)) - Number(/:\d+/.test(b)),
    )
    const resolvedBy = (aliases: boolean) =>
      ordered.find((candidate) =>
        files.some(
          (other) =>
            other !== candidate &&
            resolvesTo(specifier!, other, candidate, { aliases }),
        ),
      )
    const resolvedFile =
      specifier === undefined
        ? undefined
        : (resolvedBy(false) ?? resolvedBy(true))
    resolved = resolvedFile
    importer =
      files.find((file) => file !== resolvedFile && /:\d+/.test(file)) ??
      files.find((file) => file !== resolvedFile)
  }
  const code = parseCodeFrame(body, root)
  // Without a file of its own, the importer is where the frame shows the
  // import, or the step of the chain that imports the specifier
  importer ??=
    code?.location ||
    steps.find((step) => specifier !== undefined && step.imports === specifier)
      ?.at

  const environment = environmentOf(
    [header, ...body.filter((line) => !fieldOf(line) && indentOf(line) === 0)]
      .join(' ')
      .replace(quoted, ''),
  )
  // The runtime diagnostic of a use of a dev mock (SPEC J6.3, `mockAccess`)
  // says what the running code did with the mock (an access: a call, a
  // construction, a member read or write, a conversion); a violation
  // report is about an import, and says no such thing
  if (code === undefined && fields.some(({ value }) => isMockAccess(value))) {
    return undefined
  }
  // (a bundler's plugin tag or error class before a report is not one)
  const hasBody = fields.length > 0 || items.length > 0 || code !== undefined
  const announced =
    (announcesImportProtection(header) && hasBody) ||
    (importer !== undefined && specifier !== undefined)
  if (!announced) {
    return undefined
  }
  if (
    importer === undefined ||
    specifier === undefined ||
    environment === undefined
  ) {
    throw new Error(
      `an import-protection report whose ${[
        importer === undefined && 'importer',
        specifier === undefined && 'specifier',
        environment === undefined && 'environment type',
      ]
        .filter(Boolean)
        .join(', ')} could not be read:\n${text}`,
    )
  }
  return {
    environment,
    importer,
    specifier,
    ...(resolved !== undefined && { resolved }),
    trace: orientedFromEntry(steps, importer, specifier),
    ...(code && { code }),
    suggestions,
    text,
  }
}

/**
 * The chain from the entry to the importer: printed either way, the end at
 * the importer's file tells the direction (SPEC J6.5; ruling 2026-10-21 R10:
 * entry first or last).
 */
function orientedFromEntry(
  steps: Array<ReportedTraceStep>,
  importer: string,
  specifier: string,
): Array<ReportedTraceStep> {
  if (steps.length < 2) {
    return steps
  }
  // The importer's end: the step in the importer's file, or the step that
  // imports the denied specifier (the importer's import, whatever path the
  // report names the importer by)
  const file = withoutLocation(importer)
  const atImporter = (step: ReportedTraceStep) =>
    withoutLocation(step.at) === file || step.imports === specifier
  return atImporter(steps[0]!) && !atImporter(steps.at(-1)!)
    ? [...steps].reverse()
    : steps
}

/**
 * The code frame: the line marked `>` (its code from the `^` caret), every
 * shown line's code, and the location printed after it.
 */
function parseCodeFrame(
  lines: Array<string>,
  root: string | undefined,
): ReportedCodeFrame | undefined {
  // Every run of frame lines; the report's frame is the one with the
  // `>`/`^` convention (J6.12). Another frame a tool adds around the report
  // (e.g. a generic frame of the failing module, without `>`) is not it.
  for (let start = 0; start < lines.length; start++) {
    if (!isFrameLine(lines[start]!)) {
      continue
    }
    const frame: Array<string> = []
    let index = start
    for (; index < lines.length && isFrameLine(lines[index]!); index++) {
      frame.push(lines[index]!)
    }
    start = index
    const highlighted = frame.findIndex((line) => /^\s*>\s*\d+\s*\|/.test(line))
    const caret = frame[highlighted + 1]?.indexOf('^') ?? -1
    if (highlighted === -1 || caret === -1) {
      continue
    }
    const after = lines.slice(index).find((line) => line.trim() !== '')
    return {
      line: Number(/(\d+)\s*\|/.exec(frame[highlighted]!)![1]),
      pointsAt: frame[highlighted]!.slice(caret),
      shows: frame.flatMap(
        (line) => /^\s*>?\s*\d+\s*\| ?(.*)$/.exec(line)?.[1] ?? [],
      ),
      location:
        after !== undefined && isBareLocation(after)
          ? relativeTo(root, after.trim())
          : '',
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Readers

/** The violation reports in `output`, in order. */
export function violationReports(output: ReportOutput): Array<ViolationReport> {
  if (
    typeof output === 'object' &&
    output !== null &&
    environmentFilter in output
  ) {
    const { output: inner, environment } = (output as EnvironmentFilter)[
      environmentFilter
    ]
    return violationReports(inner).filter(
      (report) => report.environment === environment,
    )
  }
  const { texts, root } = textsOf(output)
  return texts.flatMap((text) =>
    blocks(text).flatMap((block) => parseReport(block, root) ?? []),
  )
}

/** `environment` and `importer` of each report in `output`, in order. */
export function reportedViolations(
  output: ReportOutput,
): Array<ReportedViolation> {
  return violationReports(output).map(({ environment, importer }) => ({
    environment,
    importer,
  }))
}

/** The text of each report in `output`, in order. */
export function violationTexts(output: ReportOutput): Array<string> {
  return violationReports(output).map(({ text }) => text)
}

/**
 * The directions a report's suggestions give (`server`: keep the code on
 * the server; `client`: keep it on the client). Reads only its suggestions
 * (the prose list items): source excerpts and chain steps do not constitute
 * a remedy. An actionable direction may name a public API or describe
 * moving/keeping the import in the appropriate environment; J6.12 leaves
 * the wording free.
 */
export function suggestedDirections(text: string): Array<'server' | 'client'> {
  const remedy = violationReports(text)
    .flatMap(({ suggestions }) => suggestions)
    .join('\n')
  const directions = {
    server: ['createServerFn', 'createServerOnlyFn'],
    client: ['createClientOnlyFn', 'ClientOnly'],
  } as const
  return (['server', 'client'] as const).filter(
    (direction) =>
      directions[direction].some(
        (name) => findDiagnostics(remedy, { names: [name] }).length > 0,
      ) ||
      new RegExp(
        `\\b(?:move|keep|run|render|isolate|put|relocate)\\b(?:(?!\\b(?:client|server)\\b)[^\\n])*\\b${direction}(?:-only| side|-side)?\\b`,
        'i',
      ).test(remedy),
  )
}

/**
 * A violation a test expects: its environment type, the importer's genuine
 * use of the denied import (`use`, `file:line:column` from `locationIn`, or
 * `file:line` for any column) in the importer's original `source`, and
 * other places the report may be at instead (e.g. a marker's origin).
 */
export interface ExpectedViolation {
  environment: 'client' | 'server'
  use: string
  source: string
  /** Other genuine uses of the same import in `source` (`file:line:column`). */
  otherUses?: Array<string>
  others?: RelevantLocation['others']
}

/** `environment use`: how `expectViolationsAt` names an expected violation. */
export const violationLabel = (expected: ExpectedViolation) =>
  `${expected.environment} ${expected.use}`

/**
 * Each distinct violation reported in `output` (environment type and
 * importer location), named `violationLabel` of the expected violation it
 * is a report of, else `environment importer` as reported. A report is of
 * an expected violation when its environment type is the same and its
 * location is relevant (SPEC J6.5; V1R ip I01): the genuine use, any line
 * of the importer's original import of the reported specifier, or one of
 * `others` (`isRelevantLocation`). Never compiled coordinates, nor the file
 * without a location.
 */
export function relevantViolations(
  output: unknown,
  expected: Array<ExpectedViolation>,
): Array<string> {
  const seen = new Set<string>()
  const labels: Array<string> = []
  for (const report of violationReports(output)) {
    const key = `${report.environment} ${report.importer}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    const match = expected.find((violation) => {
      const use = parseLocation(violation.use)
      const uses = [use, ...(violation.otherUses ?? []).map(parseLocation)]
      return (
        violation.environment === report.environment &&
        isRelevantLocation(report.importer, {
          file: use.file,
          source: violation.source,
          uses: uses.map(({ line, column }) => ({ line: line!, column })),
          imports: [report.specifier],
          others: violation.others,
        })
      )
    })
    labels.push(match ? violationLabel(match) : key)
  }
  return labels
}

/**
 * Asserts that the distinct violations reported in `output` are exactly
 * the `expected` ones, each reported once at a relevant location
 * (`relevantViolations`), in any order.
 */
export function expectViolationsAt(
  output: unknown,
  expected: Array<ExpectedViolation>,
) {
  expect(relevantViolations(output, expected).sort()).toEqual(
    expected.map(violationLabel).sort(),
  )
}

/** The original sources of an app's files, by path relative to its root. */
export type AppSources =
  | Record<string, string>
  | ((file: string) => string | undefined)

/**
 * The specifiers of `file`'s static imports a report's specifier names: the
 * specifier as written or, for a relative one, the project-relative file
 * it resolves to (with or without its extension). The second form is the
 * dev duplicate report that names the resolved path (pinned in dev.test.ts,
 * "'once' logs one warning for one import"); its location still counts.
 */
function importedAs(file: string, source: string, reported: string) {
  const written = new Set([reported])
  let requests: Array<string> = []
  try {
    requests = parseSync(
      `module.${/\.[cm]?jsx?$/.test(file) ? 'jsx' : 'tsx'}`,
      source,
      {
        sourceType: 'module',
      },
    ).module.staticImports.map((statement) => statement.moduleRequest.value)
  } catch {
    // Not JavaScript (e.g. MDX): only the specifier as written
  }
  for (const request of requests) {
    if (!request.startsWith('.')) {
      continue
    }
    const resolved = path.posix.join(path.posix.dirname(file), request)
    if (
      reported === resolved ||
      reported.replace(/\.[^./]+$/, '') === resolved
    ) {
      written.add(request)
    }
  }
  return [...written]
}

/** The environment markers (`import '@tanstack/react-start/server-only'`). */
const markerSpecifiers = ['react', 'solid', 'vue'].flatMap((framework) =>
  ['server-only', 'client-only'].map(
    (marker) => `@tanstack/${framework}-start/${marker}`,
  ),
)

/**
 * The importer of each report in `output` (in order, one per report), as
 * `environment file` when the report is at a relevant original place of
 * the importer (SPEC J6.5; never compiled coordinates): any line of its
 * import of the reported specifier, or a reference to a binding that
 * import introduces (`importLines`, `importedBindingUses`), in its source
 * from `sources`. A marked module a marker violation is reported at (audit
 * F ASK-1) is at a relevant place on a line of its marker import, or named
 * without coordinates. Otherwise the report as it is, `environment
 * importer (not at a relevant original place)`, which no expected list
 * names: compiled coordinates, another line, or no coordinates. For tests
 * of which importers are reported; tests of where name the genuine use
 * (`expectViolationsAt`).
 */
export function locatedImporters(
  output: ReportOutput,
  sources: AppSources,
): Array<string> {
  const sourceOf =
    typeof sources === 'function' ? sources : (file: string) => sources[file]
  return violationReports(output).map(
    ({ environment, importer, specifier }) => {
      const { file } = parseLocation(importer)
      const source = sourceOf(file)
      const markerLines =
        source === undefined
          ? []
          : markerSpecifiers.flatMap((marker) =>
              importLines(file, source, marker),
            )
      const imports =
        source === undefined ? [] : importedAs(file, source, specifier)
      const relevant =
        source !== undefined &&
        isRelevantLocation(importer, {
          file,
          source,
          uses: imports.flatMap((imported) =>
            importedBindingUses(file, source, imported),
          ),
          imports,
          others:
            markerLines.length > 0
              ? [{ file, lines: markerLines, unlocated: true }]
              : [],
        })
      return relevant
        ? `${environment} ${file}`
        : `${environment} ${importer} (not at a relevant original place)`
    },
  )
}

/**
 * Asserts that `report`'s code frame shows the importer's original
 * `source` at the reported location: it highlights that line, shows it and
 * points at its column (`expectFrameAt`), and the location shown with it,
 * when there is one, is the reported one. Lines of context are free (SPEC
 * §5.7).
 */
export function expectReportFrame(
  report: { importer: string; code?: ReportedCodeFrame },
  source: string,
) {
  const location = parseLocation(report.importer)
  expect(location.line, `${report.importer} has a line`).toBeDefined()
  expectFrameAt(report.code, source, {
    line: location.line!,
    column: location.column,
  })
  if (report.code!.location !== '') {
    expect(report.code!.location).toBe(report.importer)
  }
}
