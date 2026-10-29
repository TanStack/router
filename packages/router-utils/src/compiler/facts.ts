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
  /**
   * Built from the text without a parse (`RawFactsOptions.opaque`): no
   * summary, and target facts that are not the module's (`getTarget` parses
   * when a consumer asks for them).
   */
  opaque?: true
}

export interface RawFactsOptions {
  readFile: (path: string) => Promise<string | null>
  loadVirtual: (id: string) => Promise<string | null>
  /** Whether a bare package specifier is side-effect free (`sideEffects: false`); unknown → effectful. */
  packageSideEffectFree?: (
    specifier: string,
    importerCanonicalId: string,
  ) => Promise<boolean | null>
  recognizer?: RecognizerTable
  summaryExtras?: SummaryExtraHook
  markerSpecifiers?: Record<string, 'server-only' | 'client-only'>
  /**
   * Whether a module is opaque to the summaries, by its path and text (an
   * ordinary package: its exports carry no value a planner recognises). An
   * opaque module is not parsed: its summary is null (`unknown` to a
   * resolver), its marker is read from the text, and its target facts are
   * parsed only when asked (`getTarget`).
   */
  opaque?: (path: string, text: string) => boolean
}

const isVirtualId = (canonicalId: string): boolean =>
  canonicalId.startsWith('\0') || canonicalId.startsWith('virtual:')

/** The target facts of an opaque module before anyone asks for them: exists, no marker, otherwise unknown (effectful). */
const OPAQUE_TARGET: Omit<TargetFacts, 'digest'> = {
  exists: true,
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

interface FactsEntry {
  stale: boolean
  facts: RawFacts | null
  pending: Promise<RawFacts> | null
  /** The revision at which the text holds no marker literal (`marker` answered without a parse). */
  markerless: string | null
  pendingMarker: Promise<TargetFacts['marker']> | null
}

export class RawFactsCache {
  private readonly entries = new Map<string, FactsEntry>()
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

  /** The pure exports of the recognizer's known packages (R79), for the analyses of compiled modules. */
  get pureCalls(): RecognizerTable['pureCalls'] {
    return this.opts.recognizer?.pureCalls
  }

  /** The known (possibly stale-marked) revision, without reading. */
  peekRevision(
    canonicalId: string,
  ): { revision: string | null; stale: boolean } | null {
    const e = this.entries.get(canonicalId)
    if (!e) {
      return null
    }
    if (e.facts && !e.stale) {
      return { revision: e.facts.rawRevision, stale: false }
    }
    if (e.markerless !== null) {
      return { revision: e.markerless, stale: false }
    }
    return e.facts ? { revision: e.facts.rawRevision, stale: true } : null
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
      e.markerless = null
      e.pendingMarker = null
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
      const e = this.entries.get(id)!
      e.pending = null
      e.pendingMarker = null
      this.deleteEntry(id)
    }
  }

  private setEntry(canonicalId: string, e: FactsEntry): void {
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
        e.pendingMarker = null
        this.deleteEntry(id)
      }
    }
  }

  async get(canonicalId: string): Promise<RawFacts> {
    if (this.noFacts) {
      return this.isKnownSpecifier(canonicalId)
        ? this.knownFacts(canonicalId)
        : this.build(canonicalId, await this.read(canonicalId))
    }
    let e = this.entries.get(canonicalId)
    if (e && e.facts && !e.stale) {
      this.counters.factsHits++
      return e.facts
    }
    if (this.isKnownSpecifier(canonicalId)) {
      const facts = this.knownFacts(canonicalId)
      this.setEntry(canonicalId, this.entryOf(facts))
      return facts
    }
    if (e?.pending) {
      return e.pending
    }
    if (!e) {
      e = this.entryOf(null)
      this.setEntry(canonicalId, e)
    }
    const entry = e
    const holder: { p: Promise<RawFacts> | null } = { p: null }
    holder.p = (async () => {
      const text = await this.read(canonicalId)
      const built = this.build(canonicalId, text)
      // A file that stops parsing (saved mid-edit) keeps the last facts it
      // parsed to: its importers' decisions stand until it parses again (a
      // changed digest would evict their plans and hot-update modules that
      // cannot accept, e.g. a route tree, into a full reload). A file that
      // never parsed is unknown.
      const facts =
        text !== null &&
        built.summary === null &&
        !built.opaque &&
        entry.facts?.summary
          ? entry.facts
          : built
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
    if (
      e &&
      e.facts &&
      !e.facts.opaque &&
      !e.stale &&
      e.facts.rawRevision === rawRevision
    ) {
      return e.facts
    }
    const facts = this.fromAnalysis(canonicalId, rawRevision, analysis)
    if (!this.noFacts) {
      this.setEntry(canonicalId, this.entryOf(facts))
    }
    return facts
  }

  private entryOf(facts: RawFacts | null): FactsEntry {
    return {
      stale: false,
      facts,
      pending: null,
      markerless: null,
      pendingMarker: null,
    }
  }

  /**
   * The marker of a target, and nothing else (what every import edge asks of
   * its target): a text without a marker specifier's literal has no marker
   * import, so it is not parsed; one with the literal gets its full facts.
   * Served from the entry's facts when they are current.
   */
  async marker(canonicalId: string): Promise<TargetFacts['marker']> {
    const e = this.entries.get(canonicalId)
    if (e && !this.noTargets) {
      if (e.facts && !e.stale) {
        return e.facts.targetFacts.marker
      }
      // (`markerless` and a pending scan are of the text since the last `markStale`)
      if (e.markerless !== null) {
        return null
      }
      if (e.pendingMarker) {
        return e.pendingMarker
      }
    }
    if (this.isKnownSpecifier(canonicalId)) {
      return null
    }
    const entry = e ?? this.entryOf(null)
    if (!e && !this.noTargets) {
      this.setEntry(canonicalId, entry)
    }
    const holder: { p: Promise<TargetFacts['marker']> | null } = { p: null }
    holder.p = (async () => {
      const text = await this.read(canonicalId)
      if (text !== null && this.mayHaveMarker(text)) {
        if (entry.pendingMarker === holder.p) {
          entry.pendingMarker = null
        }
        return (await this.getTarget(canonicalId)).targetFacts.marker
      }
      if (entry.pendingMarker === holder.p) {
        entry.pendingMarker = null
        if (text !== null && !this.noTargets) {
          entry.markerless = revision(text)
        } else if (!entry.facts && this.entries.get(canonicalId) === entry) {
          // a missing file is not kept (`forget`)
          this.deleteEntry(canonicalId)
        }
      }
      return null
    })()
    entry.pendingMarker = holder.p
    return holder.p
  }

  /** Whether a text can hold a marker import: it contains a marker specifier's literal. */
  private mayHaveMarker(text: string): boolean {
    for (const spec of Object.keys(
      this.opts.markerSpecifiers ?? DEFAULT_MARKERS,
    )) {
      if (text.includes(spec)) {
        return true
      }
    }
    return false
  }

  async digestOf(canonicalId: string): Promise<string | null> {
    const f = await this.get(canonicalId)
    return f.summary?.digest ?? null
  }

  /** The facts J6 target facts are taken from (`get`, or a fresh read when the target-facts knob is off). */
  async getTarget(canonicalId: string): Promise<RawFacts> {
    if (this.noTargets && !this.isKnownSpecifier(canonicalId)) {
      return this.build(canonicalId, await this.read(canonicalId), true)
    }
    const facts = await this.get(canonicalId)
    if (!facts.opaque) {
      return facts
    }
    // an opaque module's target facts are asked for (a mock of it): parsed
    // now, once. Its summary stays null: the module is opaque to the
    // summaries whether or not a mock asked about it, so the digest plans
    // recorded (`null`) stays current and nothing is evicted by the question
    const e = this.entries.get(canonicalId)
    const text = await this.read(canonicalId)
    const full: RawFacts = {
      ...this.build(canonicalId, text, true),
      summary: null,
    }
    if (e && this.entries.get(canonicalId) === e && e.facts === facts) {
      e.facts = full
    }
    return full
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
    let markerless = 0
    let opaque = 0
    let bytes = 0
    for (const e of this.entries.values()) {
      stale += e.stale ? 1 : 0
      pending += e.pending ? 1 : 0
      empty += e.facts ? 0 : 1
      markerless += !e.facts && e.markerless !== null ? 1 : 0
      opaque += e.facts?.opaque ? 1 : 0
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
      rawFactsMarkerless: markerless,
      rawFactsOpaque: opaque,
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

  /** The module's text; '' for a file that is no JavaScript (an asset, `?url`): never read, `build` describes it unanalysed. */
  private async read(canonicalId: string): Promise<string | null> {
    if (isVirtualId(canonicalId)) {
      this.counters.factsReads++
      return this.opts.loadVirtual(canonicalId)
    }
    const id = identify(canonicalId)
    if (id.lang === null) {
      return ''
    }
    this.counters.factsReads++
    return this.opts.readFile(id.path)
  }

  /** The facts of a text; `full` parses an opaque module too (its target facts are asked for). */
  private build(
    canonicalId: string,
    text: string | null,
    full = false,
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
    if (
      !full &&
      this.opts.opaque?.(id.path, text) &&
      !this.mayHaveMarker(text)
    ) {
      return {
        canonicalId,
        rawRevision: rev,
        summary: null,
        targetFacts: { ...OPAQUE_TARGET, digest: digestOf(OPAQUE_TARGET) },
        opaque: true,
      }
    }
    // a virtual module without an extension is JavaScript; a file without a language is not
    const parsed =
      id.lang === null && !isVirtualId(canonicalId)
        ? null
        : parseModule(text, {
            lang: id.lang ?? 'ts',
            path: id.path,
            sourceType: isCommonJsPath(id.path) ? 'commonjs' : undefined,
          })
    if (!parsed?.ok) {
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
      pureCalls: this.opts.recognizer?.pureCalls,
    })
    return this.fromAnalysis(canonicalId, rev, analysis)
  }

  private fromAnalysis(
    canonicalId: string,
    rawRevision: string,
    analysis: ModuleAnalysis,
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
    const evaluated = new Set<string>()
    for (const i of analysis.imports) {
      if (!i.typeOnly && (i.bare || i.specifiers.some((s) => !s.typeOnly))) {
        evaluated.add(i.specifier)
      }
    }
    for (const r of analysis.reexports) {
      if (!r.typeOnly) {
        evaluated.add(r.specifier)
      }
    }
    const imports = [...evaluated].filter((spec) => !isMarker(spec))
    const bareImportEffect = analysis.imports.some(
      (i) => i.bare && !i.typeOnly && !isMarker(i.specifier),
    )
    const lazyImports = [
      ...new Set(analysis.dynamicEdges.map((e) => e.specifier)),
    ].filter((spec) => !isMarker(spec))
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
