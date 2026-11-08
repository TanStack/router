/**
 * Dev reporting: a violation is decided when its
 * importer is compiled (`onViolation` was told); the report is printed
 * once the bundler's graph knows how the importer is reached, so its trace
 * is a real chain from an entry. No microtask polling: one yielding timer
 * for the whole queue (0, 10, 50, 100, 250, 500, 1000 ms…), a report whose
 * importer the graph still does not know after 2 s is printed with
 * the trace the graph has. Hosts with a completion event (Rspack
 * `finishModules`) call `flush(true)` instead.
 */
import { formatViolation } from './trace'
import { dedupeKey } from './violations'
import type { ImportProtectionConfig } from './config'
import type { EdgeViolation, ReportedInfo } from './violations'
import type { ReportContext } from './trace'

export interface DevReport {
  violation: EdgeViolation
  info: ReportedInfo
}

export interface ReportSink {
  /** Prints a formatted report (a warning: dev `error` violations fail the transform instead). */
  warn: (message: string, report: DevReport) => void
}

export interface DevReporterOptions {
  config: ImportProtectionConfig
  /** How reports are formatted (`formatViolation`). */
  report: ReportContext
  sink: ReportSink
  /** Whether the graph knows how `importerId` is reached (it has importers or is an entry). */
  reachable: (importerId: string) => boolean
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}

const DELAYS = [0, 10, 50, 100, 250, 500, 1000]
/** Longest wait for the graph, from enqueue (ms). */
const MAX_WAIT = 2000

export class DevReporter {
  private queue: Array<DevReport & { at: number }> = []
  private readonly printed = new Set<string>()
  private timer: unknown = null
  private attempt = 0
  private closed = false
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (timer: unknown) => void

  constructor(private readonly opts: DevReporterOptions) {
    this.now = opts.now ?? Date.now
    this.setTimer =
      opts.setTimer ??
      ((fn, ms) => {
        const t = setTimeout(fn, ms)
        ;(t as { unref?: () => void }).unref?.()
        return t
      })
    this.clearTimer =
      opts.clearTimer ??
      ((t) => clearTimeout(t as ReturnType<typeof setTimeout>))
  }

  /**
   * Queues the report of a violation decided now. `log: 'once'` prints each
   * logical edge once per session; `'always'` every time its importer is
   * compiled (each call).
   */
  enqueue(report: DevReport): void {
    if (this.closed) {
      return
    }
    if (this.opts.config.log === 'once') {
      const key = dedupeKey(report.violation)
      if (this.printed.has(key)) {
        return
      }
      this.printed.add(key)
    }
    this.queue.push({ ...report, at: this.now() })
    this.schedule(true)
  }

  /** Prints every report whose importer is reachable (all of them with `force`). */
  flush(force = false): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer)
      this.timer = null
    }
    const keep: typeof this.queue = []
    const now = this.now()
    for (const r of this.queue) {
      if (
        force ||
        this.opts.reachable(r.violation.importerId) ||
        now - r.at >= MAX_WAIT
      ) {
        this.opts.sink.warn(
          formatViolation(r.violation, r.info, this.opts.report),
          r,
        )
      } else {
        keep.push(r)
      }
    }
    this.queue = keep
    if (keep.length > 0) {
      this.schedule(false)
    } else {
      this.attempt = 0
    }
  }

  close(): void {
    this.closed = true
    if (this.timer !== null) {
      this.clearTimer(this.timer)
      this.timer = null
    }
    this.queue = []
  }

  private schedule(fresh: boolean): void {
    if (this.timer !== null || this.closed) {
      return
    }
    if (fresh) {
      this.attempt = 0
    }
    const delay = DELAYS[Math.min(this.attempt, DELAYS.length - 1)]!
    this.attempt++
    this.timer = this.setTimer(() => {
      this.timer = null
      this.flush()
    }, delay)
  }
}

/**
 * The error dev `error` violations fail their importer's transform with: the
 * reports, without the frames of the code that made it (the reports say all
 * there is). `id`: the importer's file. No `loc`: the report names the
 * first one's position, 1-based, with its code frame (Vite prints a Rollup
 * `loc`'s 0-based column as given); `at` is that position for a host that
 * records it (Rsbuild's located diagnostics).
 */
export interface DevViolationError extends Error {
  id?: string
  at?: { line: number; column: number }
}

export function devViolationError(
  reports: Array<DevReport>,
  ctx: ReportContext,
): DevViolationError {
  const message = reports
    .map((r) => formatViolation(r.violation, r.info, ctx))
    .join('\n')
  const error: DevViolationError = new Error(message)
  error.stack = message
  const [first] = reports
  if (first) {
    const loc = first.info.importerLoc
    error.id = loc?.file ?? first.info.importer
    if (loc) {
      error.at = { line: loc.line, column: loc.column }
    }
  }
  return error
}
