/**
 * Cross-module export resolution over summaries: DFS
 * with a lookup path; explicit exports beat stars; two stars resolving to
 * different origins are ambiguous; results computed across a cut cycle edge
 * are tainted and not memoised; untainted results are memoised per resolver.
 */
import type { ModuleSummary } from './summary'
import type { AbstractValue } from './values'

/**
 * The keys a recursive lookup is computing, innermost first. Each top-level
 * lookup starts its own path, so concurrent lookups never read each other's
 * unfinished work as a cycle. Memoise settled results only: waiting on an
 * unfinished lookup deadlocks on a real cycle.
 */
export class LookupPath {
  /** A lookup on this path met a cut cycle: its result may differ from another entry point's and must not be memoised. */
  tainted = false

  private constructor(
    private readonly key: string | null,
    private readonly parent: LookupPath | null,
  ) {}

  static start(): LookupPath {
    return new LookupPath(null, null)
  }

  /** This path extended by `key`, or null when `key` is on it already: a cycle, cut here, which taints every lookup on the path. */
  enter(key: string): LookupPath | null {
    for (let p: LookupPath | null = this; p; p = p.parent) {
      if (p.key === key) {
        for (let q: LookupPath | null = this; q; q = q.parent) {
          q.tainted = true
        }
        return null
      }
    }
    return new LookupPath(key, this)
  }
}

type ResolveOutcome =
  | {
      k: 'found'
      origin: { canonicalId: string; local: string }
      value: AbstractValue
    }
  | { k: 'absent' }
  | { k: 'ambiguous' }
  | { k: 'cycleUnknown' }

interface ResolverDeps {
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

  resolve(canonicalId: string, name: string): Promise<ResolveOutcome> {
    return this.walk(canonicalId, name, LookupPath.start())
  }

  /** The module's summary, for a caller listing what it exports. */
  summary(canonicalId: string): Promise<ModuleSummary | null> {
    return this.deps.summaryOf(canonicalId)
  }

  private async walk(
    canonicalId: string,
    name: string,
    path: LookupPath,
  ): Promise<ResolveOutcome> {
    const key = `${canonicalId}\u0000${name}`
    const hit = this.memo.get(key)
    if (hit) {
      return hit
    }
    // (the module and the name, as the spec's ResolveExport: a star cycle may
    // pass a module again for another name)
    const inner = path.enter(key)
    if (!inner) {
      return { k: 'cycleUnknown' }
    }
    const summary = await this.deps.summaryOf(canonicalId)
    if (!summary) {
      return { k: 'absent' }
    }
    const fact = summary.exports[name]
    if (fact) {
      if (fact.kind === 'local') {
        return this.settle(key, inner, {
          k: 'found',
          origin: { canonicalId, local: name },
          value: fact.value,
        })
      }
      if (fact.kind === 'namespace') {
        return this.settle(key, inner, {
          k: 'found',
          origin: { canonicalId, local: name },
          value: { t: 'namespace', specifier: fact.specifier },
        })
      }
      const target = await this.deps.resolveSpecifier(
        fact.specifier,
        canonicalId,
      )
      if (target === null) {
        return this.settle(key, inner, {
          k: 'found',
          origin: { canonicalId, local: name },
          value: {
            t: 'importRef',
            specifier: fact.specifier,
            name: fact.fromName,
          },
        })
      }
      return this.settle(
        key,
        inner,
        await this.walk(target, fact.fromName, inner),
      )
    }
    if (name === 'default') {
      return { k: 'absent' }
    }
    let found: Extract<ResolveOutcome, { k: 'found' }> | null = null
    let ambiguous = false
    for (const star of summary.stars) {
      const target = await this.deps.resolveSpecifier(star, canonicalId)
      if (target === null) {
        continue
      }
      const r = await this.walk(target, name, inner)
      if (r.k === 'found') {
        if (
          found &&
          (found.origin.canonicalId !== r.origin.canonicalId ||
            found.origin.local !== r.origin.local)
        ) {
          ambiguous = true
        } else {
          found = r
        }
      } else if (r.k === 'ambiguous') {
        ambiguous = true
      }
    }
    return this.settle(
      key,
      inner,
      ambiguous
        ? { k: 'ambiguous' }
        : (found ?? (inner.tainted ? { k: 'cycleUnknown' } : { k: 'absent' })),
    )
  }

  private settle(
    key: string,
    path: LookupPath,
    outcome: ResolveOutcome,
  ): ResolveOutcome {
    if (!path.tainted) {
      this.memo.set(key, outcome)
    }
    return outcome
  }
}
