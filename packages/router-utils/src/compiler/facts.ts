/**
 * `RawFacts`: the one owner of raw module text per canonical id (see
 * README.md, "Caches and invalidation"). Serves summaries (raw domain) and J6
 * target facts (marker, export names, effect classification) from the same
 * read. Content-addressed, lazily built, invalidated by the watcher through
 * `markStale`.
 */
import { digestOf, identify, isCommonJsPath, revision } from './identity'
import { parseModule } from './source'
import { DEFAULT_MARKERS, ModuleAnalysis } from './analysis'
import { buildSummary } from './summary'
import { EMPTY_RECOGNIZER, isKnownSpecifier } from './values'
import { approxBytes, cacheDisabled } from './stats'
import type { ModuleSummary, SummaryExtraHook } from './summary'
import type { AbstractValue, RecognizerTable } from './values'

export interface TargetFacts {
  exists: boolean
  marker: 'server-only' | 'client-only' | 'conflict' | null
  /** Own export names (`default` included); `export *` targets are in `stars`. */
  exportNames: Array<string>
  /** Specifiers of `export * from` (not followed: consumers resolve them). */
  stars: Array<string>
  /** Specifiers the module evaluates when it is evaluated (non-type imports and re-exports). */
  imports: Array<string>
  /** Literal specifiers of `import()` and `require()` calls: loaded later, by a consumer following the module's whole reach. */
  lazyImports: Array<string>
  /** An ES module (false: CommonJS, script or unparseable — exports unknown). */
  esm: boolean
  /** Own top-level effects or a bare import (transitive classification is the consumer's). */
  effectful: boolean
  /** Its own statements have effects, module loading (`imports`) aside. */
  codeEffects: boolean
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
  stars: [],
  imports: [],
  lazyImports: [],
  esm: false,
  effectful: true,
  codeEffects: true,
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
  /** Path → canonical ids of `entries` at it (`markStale`/`forget` without a scan). */
  private readonly byPath = new Map<string, Set<string>>()
  /** `TSR_COMPILER_NO_CACHE=facts|targets`: every read rebuilds (measurement knobs). */
  private readonly noFacts = cacheDisabled('facts')
  private readonly noTargets = cacheDisabled('targets')
  /** Use counts for `compilerStats()`: requests served from the cache, and reads. */
  private readonly counters = { factsHits: 0, factsReads: 0 }

  constructor(private readonly opts: RawFactsOptions) {}

  /** Whether `specifier` is a known package of the recognizer: it is never read or resolved: its exports are known by name. */
  isKnownSpecifier(specifier: string): boolean {
    return isKnownSpecifier(this.opts.recognizer ?? EMPTY_RECOGNIZER, specifier)
  }

  /** The marker specifiers every analysis of this session uses (transform and raw reads agree). */
  get markerSpecifiers(): RawFactsOptions['markerSpecifiers'] {
    return this.opts.markerSpecifiers
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
    for (const id of this.byPath.get(path) ?? []) {
      const e = this.entries.get(id)!
      e.stale = true
      // a read in flight may hold the text from before the event: it is not published
      e.pending = null
    }
  }

  /**
   * Forgets the facts of a deleted file: entries are kept for files that
   * exist only (a missing file's facts are not stored either), so the cache
   * is bounded by the live files, not by every file a session saw.
   */
  forget(path: string): void {
    for (const id of [...(this.byPath.get(path) ?? [])]) {
      // a read in flight is not published
      this.entries.get(id)!.pending = null
      this.deleteEntry(id)
    }
  }

  private setEntry(
    canonicalId: string,
    e: {
      stale: boolean
      facts: RawFacts | null
      pending: Promise<RawFacts> | null
    },
  ): void {
    if (!this.entries.has(canonicalId)) {
      const path = identify(canonicalId).path
      let ids = this.byPath.get(path)
      if (!ids) {
        ids = new Set()
        this.byPath.set(path, ids)
      }
      ids.add(canonicalId)
    }
    this.entries.set(canonicalId, e)
  }

  private deleteEntry(canonicalId: string): void {
    if (!this.entries.delete(canonicalId)) {
      return
    }
    const path = identify(canonicalId).path
    const ids = this.byPath.get(path)
    if (ids) {
      ids.delete(canonicalId)
      if (ids.size === 0) {
        this.byPath.delete(path)
      }
    }
  }

  /**
   * Keeps the entries `keep` accepts. For hosts whose watcher reports a
   * deleted file only while something depends on it (Rspack): the entries
   * of files no compilation depends on any more are dropped.
   */
  retain(keep: (canonicalId: string) => boolean): void {
    for (const [id, e] of this.entries) {
      if (!keep(id)) {
        e.pending = null
        this.deleteEntry(id)
      }
    }
  }

  async get(canonicalId: string): Promise<RawFacts> {
    if (this.noFacts) {
      return this.isKnownSpecifier(canonicalId)
        ? this.knownFacts(canonicalId)
        : this.build(canonicalId, await this.read(canonicalId), new Set())
    }
    let e = this.entries.get(canonicalId)
    if (e && e.facts && !e.stale) {
      this.counters.factsHits++
      return e.facts
    }
    if (this.isKnownSpecifier(canonicalId)) {
      const facts = this.knownFacts(canonicalId)
      this.setEntry(canonicalId, { stale: false, facts, pending: null })
      return facts
    }
    if (e?.pending) {
      return e.pending
    }
    if (!e) {
      e = { stale: false, facts: null, pending: null }
      this.setEntry(canonicalId, e)
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
        if (text === null && this.entries.get(canonicalId) === entry) {
          // a missing file's facts are not kept (`forget`)
          this.deleteEntry(canonicalId)
        }
      }
      return facts
    })()
    entry.pending = holder.p
    return holder.p
  }

  /** Publishes facts from a transform's own parse (only when its input equals the raw text: a summary describes the module as importers load it, not as an upstream plugin rewrote it). */
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
    if (!this.noFacts) {
      this.setEntry(canonicalId, { stale: false, facts, pending: null })
    }
    return facts
  }

  async digestOf(canonicalId: string): Promise<string | null> {
    const f = await this.get(canonicalId)
    return f.summary?.digest ?? null
  }

  /** The facts J6 target facts are taken from (`get`, or a fresh read when the target-facts knob is off). */
  async getTarget(canonicalId: string): Promise<RawFacts> {
    if (this.noTargets && !this.isKnownSpecifier(canonicalId)) {
      return this.build(canonicalId, await this.read(canonicalId), new Set())
    }
    return this.get(canonicalId)
  }

  async targetDigestOf(canonicalId: string): Promise<string> {
    const f = await this.getTarget(canonicalId)
    return f.targetFacts.digest
  }

  /** Sizes for `compilerStats()`. */
  stats(withBytes: boolean): Record<string, number> {
    let stale = 0
    let pending = 0
    let empty = 0
    let bytes = 0
    for (const e of this.entries.values()) {
      stale += e.stale ? 1 : 0
      pending += e.pending ? 1 : 0
      empty += e.facts ? 0 : 1
      if (withBytes && e.facts) {
        bytes += approxBytes(e.facts)
      }
    }
    return {
      rawFacts: this.entries.size,
      rawFactPaths: this.byPath.size,
      rawFactsStale: stale,
      rawFactsPending: pending,
      rawFactsEmpty: empty,
      ...this.counters,
      ...(withBytes && { rawFactsBytes: bytes }),
    }
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
      stars: [],
      imports: [],
      lazyImports: [],
      esm: true,
      effectful: false,
      codeEffects: false,
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
    this.counters.factsReads++
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
        stars: [],
        imports: [],
        lazyImports: [],
        esm: false,
        effectful: true,
        codeEffects: true,
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
    // a marker import (`import '@tanstack/react-start/server-only'`) declares
    // the module's environment: it evaluates nothing and is no effect
    const markers = this.opts.markerSpecifiers ?? DEFAULT_MARKERS
    const isMarker = (spec: string) => markers[spec] !== undefined
    const imports: Array<string> = []
    const evaluates = (spec: string) => {
      if (!imports.includes(spec) && !isMarker(spec)) {
        imports.push(spec)
      }
    }
    for (const i of analysis.imports) {
      if (!i.typeOnly && (i.bare || i.specifiers.some((s) => !s.typeOnly))) {
        evaluates(i.specifier)
      }
    }
    for (const r of analysis.reexports) {
      if (!r.typeOnly) {
        evaluates(r.specifier)
      }
    }
    const bareImportEffect = analysis.imports.some(
      (i) => i.bare && !i.typeOnly && !isMarker(i.specifier),
    )
    const lazyImports: Array<string> = []
    for (const edge of analysis.dynamicEdges) {
      if (!lazyImports.includes(edge.specifier) && !isMarker(edge.specifier)) {
        lazyImports.push(edge.specifier)
      }
    }
    const tf: Omit<TargetFacts, 'digest'> = {
      exists: true,
      marker: analysis.markers,
      exportNames,
      stars: [...summary.stars],
      imports,
      lazyImports,
      esm: analysis.sourceType === 'module',
      effectful: own || bareImportEffect,
      codeEffects: analysis.codeEffects,
      effectProvenance: own ? 'own' : bareImportEffect ? 'import' : null,
    }
    return {
      canonicalId,
      rawRevision,
      summary,
      targetFacts: { ...tf, digest: digestOf(tf) },
    }
  }
}
