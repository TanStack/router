import type { LinkCaseId } from './cases'

export type Mode = 'client' | 'ssr'
export type Variant = 0 | 1

export type WorkerRequest =
  | {
      kind: 'init'
      mode: Mode
      caseId: LinkCaseId
      bundle: string
      variant: Variant
    }
  | { kind: 'measure'; iterations: number; variant: Variant }
  | { kind: 'stop' }

/**
 * Per-navigation timings of the timed `lane-*` client cases, in milliseconds
 * from the click: `syncMs` ends in the first macrotask queued before the click,
 * `onLoadMs` at the router's `onLoad` event (start of the match commit) and
 * `totalMs` at `onRendered`.
 */
export const PHASE_METRICS = ['syncMs', 'onLoadMs', 'totalMs'] as const
export type PhaseMetric = (typeof PHASE_METRICS)[number]

/** Means per navigation, keyed by direction (`a->b`, `b->a`). */
export type NavigationPhases = Record<
  string,
  Record<PhaseMetric, number> & { count: number }
>

export interface BlockSample {
  wallMs: number
  cpuMs: number
  processCpuMs: number
  iterations: number
  phases?: NavigationPhases
}

export type WorkerResponse =
  | { kind: 'ready'; batchMs: number }
  | { kind: 'sample'; sample: BlockSample }
  | { kind: 'stopped' }
  | { kind: 'error'; message: string }
