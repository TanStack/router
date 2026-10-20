/**
 * Reads the import-protection violation reports in the text a user sees
 * (dev server logs, build errors and warnings, Rsbuild errors boxed with
 * `│`) by their documented sections (SPEC J6.5, J6.12), not by their prose:
 * the environment type the header names, `Importer:` (`file:line:column`),
 * `Import:`, the `Trace:` steps and the `Code:` frame with its `>`/`^`
 * convention. Header wording, numbering, quotes and spacing are the
 * compiler's (J6.12); a header that announces import protection without
 * the documented sections is an unparsed candidate, which throws.
 *
 * `onViolation` gives the same violations structured (`ViolationInfo`);
 * tests that need the user-visible text (what is logged, how often, the
 * displayed trace and frame) read it through this adapter.
 */
import { expect } from 'vitest'
import {
  diagnosticsOf,
  expectFrameAt,
  findDiagnostics,
  isRelevantLocation,
  parseLocation,
} from '@tanstack/compiler-test-utils/diagnostics'
import type { RelevantLocation } from '@tanstack/compiler-test-utils/diagnostics'

export interface ReportedViolation {
  /** `client` or `server`. */
  environment: string
  /**
   * Where the violation is reported (`Importer:`): the importer relative to
   * the app root, with `:line:column` when the report has a location.
   */
  importer: string
}

export interface ReportedTraceStep {
  /** The module, as `file:line:column` when the step has a location. */
  at: string
  /** Whether the step is tagged `(entry)`. */
  entry: boolean
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
  /** The location printed under the frame. */
  location: string
}

export interface ViolationReport extends ReportedViolation {
  /** The raw specifier (`Import:`). */
  specifier: string
  /** The trace steps, in order. */
  trace: Array<ReportedTraceStep>
  code?: ReportedCodeFrame
  /** The whole report. */
  text: string
}

/**
 * A line a report labels (`Importer: ...`, `Trace:`): its label and value.
 * A bundler's error-class prefix (`RolldownError:`) is not one.
 */
function fieldOf(line: string): { label: string; value: string } | undefined {
  const match = /^\s*([A-Z][A-Za-z ]*):(?:\s+(.*?))?\s*$/.exec(line)
  if (!match || /^\w*(Error|Warning)$/.test(match[1]!)) {
    return undefined
  }
  return { label: match[1]!, value: match[2] ?? '' }
}

/** A label line's value, or `undefined`. */
function fieldValue(lines: Array<string>, label: string): string | undefined {
  for (const line of lines) {
    const field = fieldOf(line)
    if (field?.label === label) {
      return field.value
    }
  }
  return undefined
}

/**
 * Lines that cannot start a report: labelled lines, list items, numbered
 * trace steps, code-frame lines and bare locations.
 */
function isHeader(line: string): boolean {
  return (
    line.trim() !== '' &&
    !fieldOf(line) &&
    !/^\s*[-*]\s/.test(line) &&
    !/^\s*\d+[.)]\s/.test(line) &&
    !/^\s*>?\s*\d*\s*\|/.test(line) &&
    !/^\s*\S+:\d+(:\d+)?\s*$/.test(line)
  )
}

/**
 * What the reports are read from: the text a user sees (a log, an error
 * message), log entries, or anything `diagnosticsOf` reads (diagnostics, an
 * Rsbuild dev server's `diagnostics`, an error, a build result), each
 * diagnostic's text on its own.
 */
export type ReportOutput = string | Array<string> | unknown

/**
 * Splits `output` into candidate report blocks: each log entry of an array
 * (or each diagnostic's text) on its own; within a text, a block starts at
 * a header line (the first line of a paragraph that is not a section of a
 * report, or any line announcing import protection).
 */
function blocks(output: ReportOutput): Array<Array<string>> {
  if (typeof output !== 'string') {
    return diagnosticsOf(output).flatMap(({ text }) => blocks(text))
  }
  const text = output
    // Rsbuild boxes the lines of an error with `│`
    .replace(/^.*│ ?/gm, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, '')
  const lines = text.split('\n')
  const result: Array<Array<string>> = []
  let current: Array<string> | undefined
  let previousBlank = true
  for (const line of lines) {
    if (isHeader(line) && (previousBlank || mentionsImportProtection(line))) {
      current = []
      result.push(current)
    }
    current?.push(line)
    previousBlank = line.trim() === ''
  }
  return result
}

function mentionsImportProtection(line: string): boolean {
  return /import[- ]protection/i.test(line)
}

/** The lines of a block before its first labelled line: its header. */
function headerOf(block: Array<string>): Array<string> {
  const end = block.findIndex((line) => fieldOf(line))
  return block.slice(0, end === -1 ? block.length : end)
}

/**
 * Whether a block announces an import-protection violation: its header
 * names import protection and a body follows (a bundler's one-line plugin
 * tag before a report is not one), or it has an `Importer:` section.
 */
function isCandidate(block: Array<string>): boolean {
  const header = headerOf(block)
  const body = block.slice(header.length).some((line) => line.trim() !== '')
  return (
    (body && header.some(mentionsImportProtection)) ||
    fieldValue(block, 'Importer') !== undefined
  )
}

/** The violation reports in `output`, in order. */
export function violationReports(output: ReportOutput): Array<ViolationReport> {
  return blocks(output).filter(isCandidate).flatMap(parseReport)
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
 * Parses one candidate block. A runtime access report of a dev mock
 * (`Access:`) is not a violation report; a block that announces import
 * protection but lacks the documented sections throws.
 */
function parseReport(block: Array<string>): Array<ViolationReport> {
  const text = block.join('\n')
  const importer = fieldValue(block, 'Importer')
  const specifier = fieldValue(block, 'Import')
  if (fieldValue(block, 'Access') !== undefined) {
    return []
  }
  if (importer === undefined || specifier === undefined) {
    throw new Error(
      `an import-protection diagnostic without the documented Importer and Import sections:\n${text}`,
    )
  }
  const environments = [
    ...new Set(
      headerOf(block)
        .join(' ')
        .match(/\b(client|server)\b/g) ?? [],
    ),
  ]
  if (environments.length !== 1) {
    throw new Error(
      `an import-protection report whose header names ${environments.length === 0 ? 'no' : 'more than one'} environment type:\n${text}`,
    )
  }
  return [
    {
      environment: environments[0]!,
      importer,
      specifier: specifier.replace(/^["'](.*)["']$/, '$1'),
      trace: parseTrace(block),
      code: parseCodeFrame(block),
      text,
    },
  ]
}

/** The steps listed under `Trace:`, in order (their numbering is not checked). */
function parseTrace(lines: Array<string>): Array<ReportedTraceStep> {
  const trace: Array<ReportedTraceStep> = []
  const start = lines.findIndex((line) => fieldOf(line)?.label === 'Trace')
  for (let index = start + 1; start !== -1 && index < lines.length; index++) {
    const step =
      /^\s*(?:\d+[.)]|[-*])?\s*(\S+?)(?:\s+\((entry)\))?(?:\s+\(import\s+["'](.*)["']\))?\s*$/.exec(
        lines[index]!,
      )
    if (!step || lines[index]!.trim() === '') {
      break
    }
    trace.push({ at: step[1]!, entry: !!step[2], imports: step[3] })
  }
  return trace
}

/**
 * The frame under `Code:`: the line marked `>` (its code from the `^`
 * caret), every shown line's code, and the location printed under it.
 */
function parseCodeFrame(lines: Array<string>): ReportedCodeFrame | undefined {
  const start = lines.findIndex((line) => fieldOf(line)?.label === 'Code')
  if (start === -1) {
    return undefined
  }
  const frame: Array<string> = []
  for (let index = start + 1; lines[index]?.trim(); index++) {
    frame.push(lines[index]!)
  }
  const highlighted = frame.findIndex((line) => /^\s*>\s*\d+\s*\|/.test(line))
  const caret = frame[highlighted + 1]?.indexOf('^') ?? -1
  if (highlighted === -1 || caret === -1) {
    throw new Error(`no highlighted line with a caret in:\n${frame.join('\n')}`)
  }
  return {
    line: Number(/(\d+)\s*\|/.exec(frame[highlighted]!)![1]),
    pointsAt: frame[highlighted]!.slice(caret),
    shows: frame.flatMap(
      (line) => /^\s*>?\s*\d+\s*\| ?(.*)$/.exec(line)?.[1] ?? [],
    ),
    location:
      lines
        .slice(start + frame.length + 1)
        .find((line) => line.trim())
        ?.trim() ?? '',
  }
}

/**
 * Reads only the Suggestions section: source excerpts and trace names do
 * not constitute a remedy. An actionable direction may name a public API
 * or describe moving/keeping the import in the appropriate environment;
 * J6.12 leaves the wording free.
 */
export function suggestedDirections(text: string): Array<'server' | 'client'> {
  const lines = diagnosticsOf(text)
    .map(({ text: message }) => message)
    .join('\n')
    .split('\n')
  const start = lines.findIndex(
    (line) => fieldOf(line)?.label === 'Suggestions',
  )
  if (start === -1) {
    return []
  }
  const suggestions: Array<string> = []
  for (const line of lines.slice(start + 1)) {
    if (fieldOf(line)) {
      break
    }
    suggestions.push(line)
  }
  const remedy = suggestions.join('\n')
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
        `\\b(?:move|keep|run|render|isolate|put)\\b(?:(?!\\b(?:client|server)\\b)[^\\n])*\\b${direction}(?:-only| side|-side)?\\b`,
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
      return (
        violation.environment === report.environment &&
        isRelevantLocation(report.importer, {
          file: use.file,
          source: violation.source,
          uses: [{ line: use.line!, column: use.column }],
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

/**
 * Asserts that `report`'s code frame shows the importer's original
 * `source` at the reported location: it highlights that line, shows it and
 * points at its column (`expectFrameAt`), and prints that location under
 * it. Lines of context are free (SPEC §5.7).
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
  expect(report.code!.location).toBe(report.importer)
}
