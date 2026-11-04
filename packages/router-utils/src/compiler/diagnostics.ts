import { SourceText } from './output-builder'

type DiagnosticSeverity = 'error' | 'warning' | 'info'

export interface Diagnostic {
  severity: DiagnosticSeverity
  message: string
  /** UTF-16 range into the input text, when positioned. */
  range?: { start: number; end: number }
  /** The planner (or 'core' / 'parse') that reported it. */
  by?: string
  /** A stable code for the reason, used by the warning ledger. */
  code?: string
}

/**
 * The warnings a host reported this run: one per (file, reason and
 * wording). Two findings of one reason are two (two declarations kept for
 * one reason); the same finding of a module compiled again (another
 * environment, an edit that leaves it as it is) is not news.
 */
export class WarningLedger {
  private readonly seen = new Set<string>()

  /** Whether `d` is new for `path` this run (and records it). */
  once(path: string, d: { code?: string; message: string }): boolean {
    const key = `${path}\u0000${d.code ?? ''}\u0000${d.message}`
    if (this.seen.has(key)) {
      return false
    }
    this.seen.add(key)
    return true
  }

  reset(): void {
    this.seen.clear()
  }
}

/** A diagnostic's position: 1-based line, 0-based column (every ECMAScript line terminator counts). */
export interface DiagnosticPosition {
  line: number
  column: number
}

/** Where a host reports: an error fails the module (a sink may throw), a warning is printed. */
export interface DiagnosticSink {
  error: (d: Diagnostic, at: DiagnosticPosition | undefined) => void
  warn: (d: Diagnostic, at: DiagnosticPosition | undefined) => void
}

/**
 * Reports a compile's diagnostics with every host's policy: the errors
 * first, from every compile that produces them; then each warning once per
 * (file, reason and wording) per run (`ledger`). A parse failure's
 * diagnostics (they come alone) are the compiler's to word: `parse` turns
 * each into the diagnostic to report, or null to leave the module as it is.
 */
export function reportCompileDiagnostics(
  diagnostics: ReadonlyArray<Diagnostic>,
  file: string,
  code: string,
  ledger: WarningLedger,
  sink: DiagnosticSink,
  parse: (d: Diagnostic) => Diagnostic | null,
): void {
  if (diagnostics.length === 0) {
    return
  }
  let source: SourceText | null = null
  const at = (d: Diagnostic): DiagnosticPosition | undefined => {
    if (!d.range) {
      return undefined
    }
    source ??= new SourceText(code)
    const { line, column } = source.locate(d.range.start)
    return { line: line + 1, column }
  }
  const reported: Array<Diagnostic> = []
  for (const d of diagnostics) {
    const r = d.by === 'parse' ? parse(d) : d
    if (r) {
      reported.push(r)
    }
  }
  for (const d of reported) {
    if (d.severity === 'error') {
      sink.error(d, at(d))
    }
  }
  for (const d of reported) {
    if (d.severity !== 'error' && ledger.once(file, d)) {
      sink.warn(d, at(d))
    }
  }
}
