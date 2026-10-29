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
 * Reports each `(file, key)` once per session through the host channel; the
 * hosts key a warning by its code and wording.
 */
export class WarningLedger {
  private readonly seen = new Set<string>()

  constructor(private readonly report: (d: Diagnostic, path: string) => void) {}

  /** Returns true when the diagnostic was new and has been reported. */
  once(path: string, d: Diagnostic): boolean {
    const key = `${path}\u0000${d.code ?? d.message}`
    if (this.seen.has(key)) {
      return false
    }
    this.seen.add(key)
    this.report(d, path)
    return true
  }

  reset(): void {
    this.seen.clear()
  }
}
