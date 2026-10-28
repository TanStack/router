/**
 * Dev reporting: a violation is decided when its
 * importer is compiled (`onViolation` already ran); the report is printed
 * once the bundler's graph knows how the importer is reached, so its trace
 * is a real chain from an entry. No microtask polling: one yielding timer
 * for the whole queue (0, 10, 50, 100, 250, 500, 1000 ms…), a report whose
 * importer the graph still does not know after `maxWait` is printed with
 * the trace the graph has. Hosts with a completion event (Rspack
 * `finishModules`) call `flush(true)` instead.
 */
import { formatViolation } from './trace'
import { dedupeKey } from './violations'
import type { ImportProtectionConfig } from './config'
import type { EdgeViolation } from './violations'
import type { ViolationInfo } from './trace'

export interface DevReport {
  violation: EdgeViolation
  info: ViolationInfo & { freezeTrace: () => ViolationInfo['trace'] }
}

export interface ReportSink {
  /** Prints a formatted report (a warning: dev `error` violations fail the transform instead). */
  warn: (message: string, report: DevReport) => void
}

export interface DevReporterOptions {
  config: ImportProtectionConfig
  sink: ReportSink
  /** Whether the graph knows how `importerId` is reached (it has importers or is an entry). */
  reachable: (importerId: string) => boolean
  /** Longest wait for the graph, from enqueue (ms). */
  maxWait?: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}

const DELAYS = [0, 10, 50, 100, 250, 500, 1000]

export class DevReporter {
  private queue: Array<DevReport & { at: number }> = []
  private readonly printed = new Set<string>()
  private timer: unknown = null
  private attempt = 0
  private closed = false
  private readonly maxWait: number
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (timer: unknown) => void

  constructor(private readonly opts: DevReporterOptions) {
    this.maxWait = opts.maxWait ?? 2000
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
        now - r.at >= this.maxWait
      ) {
        r.info.freezeTrace()
        this.opts.sink.warn(formatViolation(r.info, this.opts.config.root), r)
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

/** The error a dev `error` violation fails its importer's transform with. */
export function devViolationError(
  info: ViolationInfo,
  config: ImportProtectionConfig,
): Error & { loc?: { file: string; line: number; column: number } } {
  const error = new Error(formatViolation(info, config.root)) as Error & {
    loc?: { file: string; line: number; column: number }
  }
  if (info.importerLoc) {
    error.loc = {
      file: info.importerLoc.file ?? info.importer,
      line: info.importerLoc.line,
      column: info.importerLoc.column - 1,
    }
  }
  return error
}
