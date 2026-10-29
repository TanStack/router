/**
 * Cross-module export resolution over summaries: DFS
 * with an active stack; explicit exports beat stars; two stars resolving to
 * different origins are ambiguous; results computed across a cut cycle edge
 * are tainted and not memoised; untainted results are memoised per resolver.
 */
import type { ModuleSummary } from './summary'
import type { AbstractValue } from './values'

export type ResolveOutcome =
  | {
      k: 'found'
      origin: { canonicalId: string; local: string }
      value: AbstractValue
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

export class ExportResolver {
  private readonly memo = new Map<string, ResolveOutcome>()

  constructor(private readonly deps: ResolverDeps) {}

  async resolve(canonicalId: string, name: string): Promise<ResolveOutcome> {
    // one active stack per top-level resolution: concurrent resolutions never see each other's path as a cycle
    const { outcome } = await this.walk(canonicalId, name, [])
    return outcome
  }

  private async walk(
    canonicalId: string,
    name: string,
    active: Array<string>,
  ): Promise<{ outcome: ResolveOutcome; tainted: boolean }> {
    const key = `${canonicalId}\u0000${name}`
    const hit = this.memo.get(key)
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
          }
          this.memo.set(key, outcome)
          return { outcome, tainted: false }
        }
        if (fact.kind === 'namespace') {
          const outcome: ResolveOutcome = {
            k: 'found',
            origin: { canonicalId, local: name },
            value: { t: 'namespace', specifier: fact.specifier },
          }
          this.memo.set(key, outcome)
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
          this.memo.set(key, outcome)
          return { outcome, tainted: false }
        }
        const r = await this.walk(target, fact.fromName, active)
        if (!r.tainted) {
          this.memo.set(key, r.outcome)
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
        const r = await this.walk(target, name, active)
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
        this.memo.set(key, outcome)
      }
      return { outcome, tainted }
    } finally {
      active.pop()
    }
  }
}
