/**
 * Cross-module export resolution over summaries: DFS
 * with an active stack; explicit exports beat stars; two stars resolving to
 * different origins are ambiguous; results computed across a cut cycle edge
 * are tainted and not memoised; untainted results are memoised per batch.
 */
import type { ModuleSummary } from './summary'
import type { AbstractValue } from './values'

export type ResolveOutcome =
  | {
      k: 'found'
      origin: { canonicalId: string; local: string }
      value: AbstractValue
      /** The export is a callee whose calls are pure when their arguments are. */
      noSideEffects?: true
    }
  | { k: 'absent' }
  | { k: 'ambiguous' }
  | { k: 'cycleUnknown' }

export interface ResolverDeps {
  /** The raw-domain summary of a canonical id (null when the module cannot be read). Records the dependency. */
  summaryOf: (canonicalId: string) => Promise<ModuleSummary | null>
  /** Resolves a specifier from an importer to a canonical id (null when unresolvable/external). */
  resolveSpecifier: (
    specifier: string,
    importerCanonicalId: string,
  ) => Promise<string | null>
}

export class ResolutionBatch {
  readonly memo = new Map<string, ResolveOutcome>()
}

export class ExportResolver {
  constructor(
    private readonly deps: ResolverDeps,
    readonly batch: ResolutionBatch = new ResolutionBatch(),
  ) {}

  async resolve(
    canonicalId: string,
    name: string,
    conditions: ReadonlyArray<string> = [],
  ): Promise<ResolveOutcome> {
    // one active stack per top-level resolution: concurrent resolutions never see each other's path as a cycle
    const { outcome } = await this.walk(
      canonicalId,
      name,
      conditions.join(','),
      [],
    )
    return outcome
  }

  private async walk(
    canonicalId: string,
    name: string,
    cond: string,
    active: Array<string>,
  ): Promise<{ outcome: ResolveOutcome; tainted: boolean }> {
    const key = `${canonicalId}\u0000${name}\u0000${cond}`
    const hit = this.batch.memo.get(key)
    if (hit) {
      return { outcome: hit, tainted: false }
    }
    if (active.includes(canonicalId)) {
      return { outcome: { k: 'cycleUnknown' }, tainted: true }
    }
    const summary = await this.deps.summaryOf(canonicalId)
    if (!summary) {
      return { outcome: { k: 'absent' }, tainted: false }
    }
    active.push(canonicalId)
    try {
      let tainted = false
      const fact = summary.exports[name]
      if (fact) {
        if (fact.kind === 'local') {
          const outcome: ResolveOutcome = {
            k: 'found',
            origin: { canonicalId, local: name },
            value: fact.value,
            ...(fact.noSideEffects && { noSideEffects: true }),
          }
          this.batch.memo.set(key, outcome)
          return { outcome, tainted: false }
        }
        if (fact.kind === 'namespace') {
          const outcome: ResolveOutcome = {
            k: 'found',
            origin: { canonicalId, local: name },
            value: { t: 'namespace', specifier: fact.specifier },
          }
          this.batch.memo.set(key, outcome)
          return { outcome, tainted: false }
        }
        const target = await this.deps.resolveSpecifier(
          fact.specifier,
          canonicalId,
        )
        if (target === null) {
          const outcome: ResolveOutcome = {
            k: 'found',
            origin: { canonicalId, local: name },
            value: {
              t: 'importRef',
              specifier: fact.specifier,
              name: fact.fromName,
            },
          }
          this.batch.memo.set(key, outcome)
          return { outcome, tainted: false }
        }
        const r = await this.walk(target, fact.fromName, cond, active)
        if (!r.tainted) {
          this.batch.memo.set(key, r.outcome)
        }
        return r
      }
      if (name === 'default') {
        return { outcome: { k: 'absent' }, tainted: false }
      }
      let found: Extract<ResolveOutcome, { k: 'found' }> | null = null
      let ambiguous = false
      for (const star of summary.stars) {
        const target = await this.deps.resolveSpecifier(star, canonicalId)
        if (target === null) {
          continue
        }
        const r = await this.walk(target, name, cond, active)
        tainted ||= r.tainted
        if (r.outcome.k === 'found') {
          if (
            found &&
            (found.origin.canonicalId !== r.outcome.origin.canonicalId ||
              found.origin.local !== r.outcome.origin.local)
          ) {
            ambiguous = true
          } else {
            found = r.outcome
          }
        } else if (r.outcome.k === 'ambiguous') {
          ambiguous = true
        }
      }
      const outcome: ResolveOutcome = ambiguous
        ? { k: 'ambiguous' }
        : (found ?? (tainted ? { k: 'cycleUnknown' } : { k: 'absent' }))
      if (!tainted) {
        this.batch.memo.set(key, outcome)
      }
      return { outcome, tainted }
    } finally {
      active.pop()
    }
  }
}
