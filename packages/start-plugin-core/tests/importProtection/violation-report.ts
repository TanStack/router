/**
 * Reads the parts of an import-protection violation report that tell the
 * user where the leak comes from: the import trace (from the entry to the
 * importer) and the code frame. Read from the text a build prints (Vite
 * errors, and Rsbuild errors, whose lines it boxes with `│`).
 */

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

export interface ViolationReport {
  /** `Importer:`, as `file:line:column`. */
  importer: string
  /** The numbered trace steps, in order. */
  trace: Array<ReportedTraceStep>
  code?: ReportedCodeFrame
}

/** The violation reports in `output`, in order. */
export function violationReports(
  output: string | Array<string>,
): Array<ViolationReport> {
  const text = (Array.isArray(output) ? output.join('\n') : output).replace(
    /^.*│ ?/gm,
    '',
  )
  return text
    .split('[import-protection] Import denied in ')
    .slice(1)
    .map(parseReport)
}

function parseReport(report: string): ViolationReport {
  const lines = report.split('\n')
  const trace: Array<ReportedTraceStep> = []
  const traceStart = lines.findIndex((line) => line.trim() === 'Trace:')
  for (
    let index = traceStart + 1;
    traceStart !== -1 && index < lines.length;
    index++
  ) {
    const step = /^\s+(\d+)\. (\S+)( \(entry\))?(?: \(import "(.*)"\))?$/.exec(
      lines[index]!,
    )
    if (!step) {
      break
    }
    if (Number(step[1]) !== trace.length + 1) {
      throw new Error(`trace step ${step[1]} is out of order`)
    }
    trace.push({ at: step[2]!, entry: !!step[3], imports: step[4] })
  }
  return {
    importer: /Importer: (\S+)/.exec(report)?.[1] ?? '',
    trace,
    code: parseCodeFrame(lines),
  }
}

function parseCodeFrame(lines: Array<string>): ReportedCodeFrame | undefined {
  const start = lines.findIndex((line) => line.trim() === 'Code:')
  if (start === -1) {
    return undefined
  }
  const frame: Array<string> = []
  for (let index = start + 1; lines[index]?.trim(); index++) {
    frame.push(lines[index]!)
  }
  const highlighted = frame.findIndex((line) => /^\s*>\s*\d+ \|/.test(line))
  const caret = frame[highlighted + 1]?.indexOf('^') ?? -1
  if (highlighted === -1 || caret === -1) {
    throw new Error(`no highlighted line with a caret in:\n${frame.join('\n')}`)
  }
  return {
    line: Number(/(\d+) \|/.exec(frame[highlighted]!)![1]),
    pointsAt: frame[highlighted]!.slice(caret),
    shows: frame.flatMap(
      (line) => /^\s*>?\s*\d+ \| ?(.*)$/.exec(line)?.[1] ?? [],
    ),
    location:
      lines
        .slice(start + frame.length + 1)
        .find((line) => line.trim())
        ?.trim() ?? '',
  }
}
