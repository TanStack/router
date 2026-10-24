/**
 * `RawFacts`: the one owner of raw module text per canonical id (DESIGN
 * §2.9.1, §4.5; R23, R36). Serves summaries (raw domain) and J6 target
 * facts (marker, export names, effect classification) from the same read.
 * Content-addressed, lazily built, invalidated by the watcher through
 * `markStale`.
 */
import { digestOf, identify, isCommonJsPath, revision } from './identity'
import { parseModule } from './source'
import { ModuleAnalysis } from './analysis'
import { buildSummary } from './summary'
import { EMPTY_RECOGNIZER, isKnownSpecifier } from './values'
import type { ModuleSummary, SummaryExtraHook } from './summary'
import type { AbstractValue, RecognizerTable } from './values'

export interface TargetFacts {
  exists: boolean
  marker: 'server-only' | 'client-only' | 'conflict' | null
  exportNames: Array<string>
  effectful: boolean
  effectProvenance: 'own' | 'import' | 'package' | null
  digest: string
}

export interface RawFacts {
  canonicalId: string
  /** null when the module could not be read. */
  rawRevision: string | null
  summary: ModuleSummary | null
  targetFacts: TargetFacts
}

export interface RawFactsOptions {
  readFile: (path: string) => Promise<string | null>
  loadVirtual: (id: string) => Promise<string | null>
  /** Resolves a relative import of a target to a canonical id (effect classification follows them). */
  resolveRelative?: (
    specifier: string,
    importerCanonicalId: string,
  ) => Promise<string | null>
  /** Whether a bare package specifier is side-effect free (`sideEffects: false`); unknown → effectful. */
  packageSideEffectFree?: (
    specifier: string,
    importerCanonicalId: string,
  ) => Promise<boolean | null>
  recognizer?: RecognizerTable
  summaryExtras?: SummaryExtraHook
  markerSpecifiers?: Record<string, 'server-only' | 'client-only'>
}

const MISSING_TARGET: Omit<TargetFacts, 'digest'> = {
  exists: false,
  marker: null,
  exportNames: [],
  effectful: true,
  effectProvenance: null,
}

export class RawFactsCache {
  private readonly entries = new Map<
    string,
    {
      stale: boolean
      facts: RawFacts | null
      pending: Promise<RawFacts> | null
    }
  >()

  constructor(private readonly opts: RawFactsOptions) {}

  /** Whether `specifier` is a known package of the recognizer: it is never read or resolved (D4). */
  isKnownSpecifier(specifier: string): boolean {
    return isKnownSpecifier(this.opts.recognizer ?? EMPTY_RECOGNIZER, specifier)
  }

  /** The known (possibly stale-marked) revision, without reading. */
  peekRevision(
    canonicalId: string,
  ): { revision: string | null; stale: boolean } | null {
    const e = this.entries.get(canonicalId)
    if (!e || !e.facts) {
      return null
    }
    return { revision: e.facts.rawRevision, stale: e.stale }
  }

  has(canonicalId: string): boolean {
    return this.entries.has(canonicalId)
  }

  markStale(path: string): void {
    for (const [id, e] of this.entries) {
      if (identify(id).path === path || id === path) {
        e.stale = true
      }
    }
  }

  /** Drops entries nobody depends on (host bookkeeping). */
  prune(keep: (canonicalId: string) => boolean): void {
    for (const id of [...this.entries.keys()]) {
      if (!keep(id)) {
        this.entries.delete(id)
      }
    }
  }

  async get(canonicalId: string): Promise<RawFacts> {
    let e = this.entries.get(canonicalId)
    if (e && e.facts && !e.stale) {
      return e.facts
    }
    if (this.isKnownSpecifier(canonicalId)) {
      const facts = this.knownFacts(canonicalId)
      this.entries.set(canonicalId, { stale: false, facts, pending: null })
      return facts
    }
    if (e?.pending) {
      return e.pending
    }
    if (!e) {
      e = { stale: false, facts: null, pending: null }
      this.entries.set(canonicalId, e)
    }
    const entry = e
    const holder: { p: Promise<RawFacts> | null } = { p: null }
    holder.p = (async () => {
      const text = await this.read(canonicalId)
      const facts = this.build(canonicalId, text, new Set())
      // a newer read may have superseded this one
      if (entry.pending === holder.p) {
        entry.facts = facts
        entry.stale = false
        entry.pending = null
      }
      return facts
    })()
    entry.pending = holder.p
    return holder.p
  }

  /** Publishes facts from a transform's own parse (only when its input equals the raw text, R36). */
  publish(
    canonicalId: string,
    rawRevision: string,
    analysis: ModuleAnalysis,
  ): RawFacts | null {
    const e = this.entries.get(canonicalId)
    if (e && e.facts && !e.stale && e.facts.rawRevision === rawRevision) {
      return e.facts
    }
    const facts = this.fromAnalysis(canonicalId, rawRevision, analysis, null)
    this.entries.set(canonicalId, { stale: false, facts, pending: null })
    return facts
  }

  async digestOf(canonicalId: string): Promise<string | null> {
    const f = await this.get(canonicalId)
    return f.summary?.digest ?? null
  }

  async targetDigestOf(canonicalId: string): Promise<string> {
    const f = await this.get(canonicalId)
    return f.targetFacts.digest
  }

  /** The synthetic facts of a known package specifier: its factory exports, side-effect free. */
  private knownFacts(specifier: string): RawFacts {
    const table = this.opts.recognizer ?? EMPTY_RECOGNIZER
    const exportFacts: ModuleSummary['exports'] = {}
    for (const [name, kind] of Object.entries(
      table.factories[specifier] ?? {},
    )) {
      const value: AbstractValue = { t: 'factory', kind }
      exportFacts[name] = { kind: 'local', value, noSideEffects: true }
    }
    const exportNames = Object.keys(exportFacts).sort()
    const digest = digestOf({ known: specifier, exports: exportNames })
    const tf: Omit<TargetFacts, 'digest'> = {
      exists: true,
      marker: null,
      exportNames,
      effectful: false,
      effectProvenance: null,
    }
    return {
      canonicalId: specifier,
      rawRevision: digest,
      summary: {
        canonicalId: specifier,
        rawRevision: digest,
        exports: exportFacts,
        stars: [],
        isoImplExports: {},
        marker: null,
        hasImportOrExport: true,
        digest,
      },
      targetFacts: { ...tf, digest: digestOf(tf) },
    }
  }

  private async read(canonicalId: string): Promise<string | null> {
    if (canonicalId.startsWith('\0') || canonicalId.startsWith('virtual:')) {
      return this.opts.loadVirtual(canonicalId)
    }
    return this.opts.readFile(identify(canonicalId).path)
  }

  private build(
    canonicalId: string,
    text: string | null,
    _seen: Set<string>,
  ): RawFacts {
    if (text === null) {
      return {
        canonicalId,
        rawRevision: null,
        summary: null,
        targetFacts: { ...MISSING_TARGET, digest: digestOf(MISSING_TARGET) },
      }
    }
    const id = identify(canonicalId)
    const rev = revision(text)
    const lang = id.lang ?? 'ts'
    const parsed = parseModule(text, {
      lang,
      path: id.path,
      sourceType: isCommonJsPath(id.path) ? 'commonjs' : undefined,
    })
    if (!parsed.ok) {
      const tf = {
        exists: true,
        marker: null,
        exportNames: [],
        effectful: true,
        effectProvenance: 'own' as const,
      }
      return {
        canonicalId,
        rawRevision: rev,
        summary: null,
        targetFacts: { ...tf, digest: digestOf(tf) },
      }
    }
    const analysis = new ModuleAnalysis(parsed.file, parsed.source, {
      path: id.path,
      markerSpecifiers: this.opts.markerSpecifiers,
    })
    return this.fromAnalysis(canonicalId, rev, analysis, null)
  }

  private fromAnalysis(
    canonicalId: string,
    rawRevision: string,
    analysis: ModuleAnalysis,
    _unused: null,
  ): RawFacts {
    const summary = buildSummary(
      analysis,
      canonicalId,
      rawRevision,
      this.opts.recognizer ?? EMPTY_RECOGNIZER,
      this.opts.summaryExtras,
    )
    const exportNames = Object.keys(summary.exports).sort()
    const own = analysis.ownEffects
    const tf: Omit<TargetFacts, 'digest'> = {
      exists: true,
      marker: analysis.markers,
      exportNames,
      effectful: own || analysis.imports.some((i) => i.bare && !i.typeOnly),
      effectProvenance: own
        ? 'own'
        : analysis.imports.some((i) => i.bare && !i.typeOnly)
          ? 'import'
          : null,
    }
    return {
      canonicalId,
      rawRevision,
      summary,
      targetFacts: { ...tf, digest: digestOf(tf) },
    }
  }
}
