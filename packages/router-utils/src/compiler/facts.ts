/**
 * `RawFacts`: the one owner of raw module text per canonical id (see
 * README.md, "Caches and invalidation"). Serves summaries (raw domain) and J6
 * target facts (marker, export names, effect classification) from the same
 * read. Content-addressed, lazily built, invalidated by the watcher through
 * `markStale`.
 *
 * Rule: anything that changes an answer of `RawFactsCache` goes through
 * `markStale`, `forget` or `retain`. They move `version`, and a plan whose
 * facts were validated at the current version is not asked again
 * (`CacheEntry.factsAt`), so a change made any other way serves stale plans.
 * That includes a file a read found missing: its facts are not kept, and the
 * host that saw the miss marks it stale when the file may have appeared.
 */
import { digestOf, identify, isCommonJsPath, revision } from './identity'
import { parseModule } from './source'
import { DEFAULT_MARKERS, ModuleAnalysis } from './analysis'
import { buildSummary, exportKeysOf } from './summary'
import { ownEntry } from './strings'
import { EMPTY_RECOGNIZER, isKnownSpecifier } from './values'
import { approxBytes, cacheDisabled } from './stats'
import type { CodeEffects } from './analysis'
import type { ModuleSummary } from './summary'
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
  /** Per environment type, whether its own statements have effects there, module loading (`imports`) aside (`ModuleAnalysis.effects().code`). */
  codeEffects: CodeEffects
  /** Per environment type, the `imports` its compile does not evaluate: only code it erases reads them (`ModuleAnalysis.effects().erasedImports`; absent when none is). */
  erasedImports?: { client: Array<string>; server: Array<string> }
  digest: string
}

export interface RawFacts {
  summary: ModuleSummary | null
  targetFacts: TargetFacts
  /**
   * Built from the text without a parse (`RawFactsOptions.opaque`): no
   * summary, and target facts that are not the module's (`getTarget` parses
   * when a consumer asks for them).
   */
  opaque?: true
}

interface RawFactsOptions {
  readFile: (path: string) => Promise<string | null>
  /**
   * A virtual id's text, loaded by the environment that asks for its facts:
   * it resolved the id, while another environment's bundler may not own it
   * (asking one that runs concurrently, e.g. in `vite build --watch`, fails
   * that build).
   */
  loadVirtual: (id: string, env: string) => Promise<string | null>
  recognizer?: RecognizerTable
  markerSpecifiers?: Record<string, 'server-only' | 'client-only'>
  /**
   * Whether a module is opaque to the summaries, by its path and text (an
   * ordinary package: its exports carry no value a planner recognises). An
   * opaque module is not parsed: its summary is null (`unknown` to a
   * resolver), its marker is read from the text, and its target facts are
   * parsed only when asked (`getTarget`).
   */
  opaque?: (path: string, text: string) => boolean
  /**
   * A file's modification time in milliseconds (null: unknown; a whole
   * number of seconds counts as unknown). Without it, every file event that
   * reads a file empty waits for its text (`readChange`).
   */
  modifiedAt?: (path: string) => Promise<number | null>
}

/** Effects in every environment: what is unknown of a module. */
const ALL_EFFECTS: CodeEffects = { client: true, server: true }

/** Whether a module is virtual: its raw text is the host's `loadVirtual`, not a file's. */
export const isVirtualId = (canonicalId: string): boolean =>
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
  codeEffects: ALL_EFFECTS,
}

const MISSING_TARGET: Omit<TargetFacts, 'digest'> = {
  exists: false,
  marker: null,
  exportNames: [],
  stars: [],
  imports: [],
  lazyImports: [],
  esm: false,
  codeEffects: ALL_EFFECTS,
}

/** (computed once: an opaque module's read is on every package module's path) */
const OPAQUE_DIGEST = digestOf(OPAQUE_TARGET)
const MISSING_DIGEST = digestOf(MISSING_TARGET)

/** How often, and how far apart, an empty read of a file that held a module is repeated (`readSaved`: Vite's `readModifiedFile` waits as long). */
const SAVE_RETRIES = 10
const SAVE_RETRY_MS = 10

const EMPTY_REVISION = revision('')
/**
 * `seen` of a path read since the last event that changed it, by a read not
 * compared with the event's text (a cold read is not hashed: an event of the
 * path applies) or that differed from it.
 */
const UNKNOWN = '\u0000unknown'

interface FactsEntry {
  stale: boolean
  facts: RawFacts | null
  pending: Promise<RawFacts> | null
  /** Whether the text since the last `markStale` holds no marker literal (`marker` answered without a parse). */
  markerless: boolean
  /**
   * The text of the entry's next build: a read in flight, or the text a
   * file event read (`readChange`). `get` and `marker` share it, and the
   * answer built from it takes it.
   */
  reading: Promise<string | null> | null
}

export class RawFactsCache {
  private readonly entries = new Map<string, FactsEntry>()
  /** Path → canonical ids of `entries` at it (`markStale`/`forget` without a scan). */
  private readonly byPath = new Map<string, Set<string>>()
  /** `TSR_COMPILER_NO_CACHE=facts|targets`: every read rebuilds (measurement knobs). */
  private readonly noFacts = cacheDisabled('facts')
  private readonly noTargets = cacheDisabled('targets')
  /**
   * Path → the revision of the text the last file event that changed it
   * read, while every read since read the same (`UNKNOWN` once a read was
   * not compared or differed): what a file event compares the file with
   * (`readChange`). Kept for the paths with entries, and for the paths an
   * event read (a file with a plan only, a `package.json`, a created file)
   * until they are removed.
   */
  private readonly seen = new Map<string, string>()
  /** Path → reads of it in flight: their texts are not in `seen` yet. */
  private readonly reads = new Map<string, number>()
  /**
   * Path → the modification time of the file when a file event's read found
   * it empty and waited for its text in vain (`readChange`): an event that
   * finds it so again is a repeat of that one.
   */
  private readonly emptyAt = new Map<string, number>()
  /** Use counts for `compilerStats()`: requests served from the cache, and reads. */
  private readonly counters = { factsHits: 0, factsReads: 0, eventReads: 0 }
  private changes = 0

  constructor(private readonly opts: RawFactsOptions) {}

  /**
   * Moves whenever a fact this cache answers may change: an entry marked
   * stale, forgotten or dropped. A `markStale` moves it even with nothing
   * kept at the path, since a missing file's facts aren't kept and may be
   * read differently now (Rsbuild's `forgetMisses`). A fact read while the
   * version stays the same is still the cache's answer (plan validation
   * skips it: `CacheEntry.factsAt`).
   */
  get version(): number {
    return this.changes
  }

  /** Whether `specifier` is a known package of the recognizer: it is never read or resolved: its exports are known by name. */
  isKnownSpecifier(specifier: string): boolean {
    return isKnownSpecifier(this.opts.recognizer ?? EMPTY_RECOGNIZER, specifier)
  }

  /** The marker specifiers every analysis of this session uses (transform and raw reads agree). */
  get markerSpecifiers(): RawFactsOptions['markerSpecifiers'] {
    return this.opts.markerSpecifiers
  }

  /** The recognizer every analysis of this session uses (its pure calls; a compile's builder chains). */
  get recognizer(): RecognizerTable | undefined {
    return this.opts.recognizer
  }

  /**
   * Marks the facts at `path` stale. `text`: what a file event read
   * (`readChange`): the path's text from now on, which the entries' next
   * builds take instead of reading the file again.
   */
  markStale(path: string, text?: string | null): void {
    this.changes++
    if (text !== undefined && !this.noFacts) {
      if (text === null) {
        this.seen.delete(path)
        this.emptyAt.delete(path)
      } else {
        this.seen.set(path, revision(text))
      }
    }
    for (const id of this.byPath.get(path) ?? []) {
      const e = this.entries.get(id)!
      e.stale = true
      // a read in flight may hold the text from before the event: it is not published
      e.pending = null
      e.markerless = false
      e.reading = text === undefined ? null : Promise.resolve(text)
    }
  }

  /**
   * Whether the cache holds anything read of `path`, or reads it now: an
   * event of a path it does not know changes no answer of it.
   */
  knows(path: string): boolean {
    return this.byPath.has(path) || this.seen.has(path) || this.reads.has(path)
  }

  /**
   * A file event's read of `path`: its text, and whether it is the same as
   * what the cache read of the path since the last event that changed it
   * (never while a read of the path is in flight, which may hold another
   * text). `readable`: false for a file the compiler has no language for (an
   * asset), which is never read (its text is `''`, as for its facts). The
   * caller applies a differing text with `markStale`. An empty read is read
   * again for a moment (`readSaved`: an in-place save reported between
   * truncation and write), unless an event's read found it empty and waited
   * in vain, and the file was not modified since (`modifiedAt`: a repeat of
   * that event, through another hook). The same text proves that no fact of
   * the file moved, not that the file was there all along: the caller still
   * moves the file set for an `add` or a removal.
   */
  async readChange(
    path: string,
    readable: boolean,
  ): Promise<{ text: string | null; same: boolean }> {
    const seen = () => this.seen.get(path)
    let text: string | null = ''
    if (readable) {
      text = await this.readEvent(path)
      if (text === '') {
        // a whole number of seconds is unknown: on a filesystem of coarse
        // times (HFS+, ext3, FAT, some network shares) a save stamps the
        // file as the write before it did within that second
        let at = (await this.opts.modifiedAt?.(path)) ?? null
        if (at !== null && at % 1000 === 0) {
          at = null
        }
        if (
          at === null ||
          this.emptyAt.get(path) !== at ||
          seen() !== EMPTY_REVISION
        ) {
          for (let n = 0; n < SAVE_RETRIES && text === ''; n++) {
            await new Promise((resolve) => setTimeout(resolve, SAVE_RETRY_MS))
            text = await this.readEvent(path)
          }
          if (text === '' && at !== null) {
            this.emptyAt.set(path, at)
          }
        }
      }
      if (text !== '') {
        this.emptyAt.delete(path)
      }
    }
    const same =
      !this.noFacts &&
      text !== null &&
      seen() === revision(text) &&
      !this.reads.has(path)
    return { text, same }
  }

  private readEvent(path: string): Promise<string | null> {
    this.counters.eventReads++
    return this.opts.readFile(path)
  }

  /**
   * Forgets the facts of a deleted file: entries are kept for files that
   * exist only (a missing file's facts are not stored either), so the cache
   * is bounded by the live files, not by every file a session saw.
   */
  forget(path: string): void {
    this.changes++
    this.seen.delete(path)
    this.emptyAt.delete(path)
    for (const id of [...(this.byPath.get(path) ?? [])]) {
      // a read in flight is not published
      const e = this.entries.get(id)!
      e.pending = null
      e.reading = null
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
        this.changes++
        e.pending = null
        e.reading = null
        this.deleteEntry(id)
        const path = identify(id).path
        if (!this.byPath.has(path)) {
          this.seen.delete(path)
          this.emptyAt.delete(path)
        }
      }
    }
  }

  /** The facts of a module, read (on a miss) for environment `env`. */
  async get(canonicalId: string, env: string): Promise<RawFacts> {
    if (this.noFacts) {
      return this.isKnownSpecifier(canonicalId)
        ? this.knownFacts(canonicalId)
        : this.build(canonicalId, await this.read(canonicalId, env))
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
      const prior = entry.facts
      const reading = this.textOf(entry, canonicalId, env)
      const text = await this.readSaved(canonicalId, env, prior, reading)
      const built = this.build(canonicalId, text)
      // A file that stops parsing (saved mid-edit) keeps the last facts it
      // parsed to: its importers' decisions stand until it parses again (a
      // changed digest would evict their plans and hot-update modules that
      // cannot accept, e.g. a route tree, into a full reload). A file that
      // never parsed is unknown. One that still reads empty after
      // `readSaved`'s retries is empty.
      const facts =
        text !== null &&
        !built.opaque &&
        prior?.summary &&
        built.summary === null
          ? prior
          : built
      // a newer read may have superseded this one
      if (entry.pending === holder.p) {
        entry.facts = facts
        entry.stale = false
        entry.pending = null
        if (entry.reading === reading) {
          entry.reading = null
        }
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

  private entryOf(facts: RawFacts | null): FactsEntry {
    return {
      stale: false,
      facts,
      pending: null,
      markerless: false,
      reading: null,
    }
  }

  /** The entry's next text: its read in flight or carried, else a new read. */
  private textOf(
    entry: FactsEntry,
    canonicalId: string,
    env: string,
  ): Promise<string | null> {
    return (entry.reading ??= this.read(canonicalId, env))
  }

  /**
   * The marker of a target, and nothing else (what every import edge asks of
   * its target): a text without a marker specifier's literal has no marker
   * import, so it is not parsed; one with the literal gets its full facts.
   * Served from the entry's facts when they are current.
   */
  async marker(
    canonicalId: string,
    env: string,
  ): Promise<TargetFacts['marker']> {
    const e = this.entries.get(canonicalId)
    if (e && !this.noTargets) {
      if (e.facts && !e.stale) {
        return e.facts.targetFacts.marker
      }
      // (`markerless` and a build in flight are of the text since the last `markStale`)
      if (e.markerless) {
        return null
      }
      if (e.pending) {
        return (await e.pending).targetFacts.marker
      }
    }
    if (this.isKnownSpecifier(canonicalId)) {
      return null
    }
    const entry = e ?? this.entryOf(null)
    if (!e && !this.noTargets) {
      this.setEntry(canonicalId, entry)
    }
    const reading = this.textOf(entry, canonicalId, env)
    const text = await reading
    // (an empty read of a file that held a module goes to `get`, which
    // reads it again for a moment: `readSaved`. A file event checks the
    // importers' markers at once, maybe while an in-place save has the
    // file empty)
    if (
      text !== null &&
      (this.mayHaveMarker(text) ||
        (text === '' &&
          entry.facts !== null &&
          this.heldModule(canonicalId, entry.facts)))
    ) {
      return (await this.getTarget(canonicalId, env)).targetFacts.marker
    }
    if (entry.reading === reading) {
      entry.reading = null
      if (text !== null && !this.noTargets) {
        entry.markerless = true
      } else if (!entry.facts && this.entries.get(canonicalId) === entry) {
        // a missing file is not kept (`forget`)
        this.deleteEntry(canonicalId)
      }
    }
    return null
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

  /** The facts J6 target facts are taken from (`get`, or a fresh read when the target-facts knob is off). */
  async getTarget(canonicalId: string, env: string): Promise<RawFacts> {
    if (this.noTargets && !this.isKnownSpecifier(canonicalId)) {
      return this.build(canonicalId, await this.read(canonicalId, env), true)
    }
    const facts = await this.get(canonicalId, env)
    if (!facts.opaque) {
      return facts
    }
    // an opaque module's target facts are asked for (a mock of it): parsed
    // now, once. Its summary stays null: the module is opaque to the
    // summaries whether or not a mock asked about it, so the digest plans
    // recorded (`null`) stays current and nothing is evicted by the question
    const e = this.entries.get(canonicalId)
    const text = await this.read(canonicalId, env)
    const full: RawFacts = {
      ...this.build(canonicalId, text, true),
      summary: null,
    }
    if (e && this.entries.get(canonicalId) === e && e.facts === facts) {
      e.facts = full
    }
    return full
  }

  async targetDigestOf(canonicalId: string, env: string): Promise<string> {
    const f = await this.getTarget(canonicalId, env)
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
      // (an entry without facts holds no stale answer: its scan is current)
      stale += e.stale && e.facts ? 1 : 0
      pending += e.pending ? 1 : 0
      empty += e.facts ? 0 : 1
      markerless += !e.facts && e.markerless ? 1 : 0
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
      seenPaths: this.seen.size,
      emptyReadPaths: this.emptyAt.size,
      ...this.counters,
      ...(withBytes && { rawFactsBytes: bytes }),
    }
  }

  /** The synthetic facts of a known package specifier: its factory exports, side-effect free. */
  private knownFacts(specifier: string): RawFacts {
    const table = this.opts.recognizer ?? EMPTY_RECOGNIZER
    const exportFacts: ModuleSummary['exports'] = Object.create(null)
    for (const [name, kind] of Object.entries(
      ownEntry(table.factories, specifier) ?? {},
    )) {
      const value: AbstractValue = { t: 'factory', kind }
      exportFacts[name] = { kind: 'local', value }
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
      codeEffects: { client: false, server: false },
    }
    return {
      summary: {
        exports: exportFacts,
        stars: [],
        marker: null,
        exportKeyMemo: exportKeysOf(exportFacts),
        digestMemo: digest,
      },
      targetFacts: { ...tf, digest: digestOf(tf) },
    }
  }

  /** The module's text; '' for a file that is no JavaScript (an asset, `?url`): never read, `build` describes it unanalysed. */
  private async read(canonicalId: string, env: string): Promise<string | null> {
    if (isVirtualId(canonicalId)) {
      this.counters.factsReads++
      return this.opts.loadVirtual(canonicalId, env)
    }
    const id = identify(canonicalId)
    if (id.lang === null) {
      return ''
    }
    this.counters.factsReads++
    const path = id.path
    this.reads.set(path, (this.reads.get(path) ?? 0) + 1)
    let text: string | null
    try {
      text = await this.opts.readFile(path)
    } finally {
      const n = this.reads.get(path)! - 1
      if (n > 0) {
        this.reads.set(path, n)
      } else {
        this.reads.delete(path)
      }
    }
    if (!this.noFacts) {
      // (in the same step as the read's end: an event never finds a read
      // that ended and is not in `seen`)
      // (the text is hashed only to check an event's: a cold read is not)
      const seen = this.seen.get(path)
      if (text === null) {
        this.seen.delete(path)
        this.emptyAt.delete(path)
      } else if (
        seen === undefined ||
        (seen !== UNKNOWN && seen !== revision(text))
      ) {
        this.seen.set(path, UNKNOWN)
      }
    }
    return text
  }

  /**
   * `read`, for a file whose last facts were `prior`. An editor that saves
   * in place truncates the file, then writes it, and the watcher may report
   * the change in between, once (chokidar drops another change of a file
   * within a moment of the last one): a file that held a module and reads
   * empty is read again for a moment, until the text is there (as Vite's
   * `readModifiedFile` reads a changed file for its own hot updates). Still
   * empty after that, it is empty (a later write gets an event of its own).
   */
  private async readSaved(
    canonicalId: string,
    env: string,
    prior: RawFacts | null,
    first: Promise<string | null>,
  ): Promise<string | null> {
    let text = await first
    if (
      text !== '' ||
      prior === null ||
      isVirtualId(canonicalId) ||
      !this.heldModule(canonicalId, prior)
    ) {
      return text
    }
    for (let n = 0; n < SAVE_RETRIES && text === ''; n++) {
      await new Promise((resolve) => setTimeout(resolve, SAVE_RETRY_MS))
      text = await this.read(canonicalId, env)
    }
    return text
  }

  /** Whether `facts` are of a module other than an empty file's. */
  private heldModule(canonicalId: string, facts: RawFacts): boolean {
    return (
      !facts.opaque &&
      facts.targetFacts.digest !==
        this.build(canonicalId, '').targetFacts.digest
    )
  }

  /** The facts of a text; `full` parses an opaque module too (its target facts are asked for). */
  private build(
    canonicalId: string,
    text: string | null,
    full = false,
  ): RawFacts {
    if (text === null) {
      return {
        summary: null,
        targetFacts: { ...MISSING_TARGET, digest: MISSING_DIGEST },
      }
    }
    const id = identify(canonicalId)
    if (
      !full &&
      this.opts.opaque?.(id.path, text) &&
      !this.mayHaveMarker(text)
    ) {
      return {
        summary: null,
        targetFacts: { ...OPAQUE_TARGET, digest: OPAQUE_DIGEST },
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
        codeEffects: ALL_EFFECTS,
      }
      return {
        summary: null,
        targetFacts: { ...tf, digest: digestOf(tf) },
      }
    }
    const analysis = new ModuleAnalysis(parsed.file, parsed.source, {
      path: id.path,
      markerSpecifiers: this.opts.markerSpecifiers,
      recognizer: this.opts.recognizer,
    })
    return this.fromAnalysis(analysis)
  }

  private fromAnalysis(analysis: ModuleAnalysis): RawFacts {
    const summary = buildSummary(
      analysis,
      this.opts.recognizer ?? EMPTY_RECOGNIZER,
    )
    const exportNames = Object.keys(summary.exports).sort()
    const effects = analysis.effects()
    // a marker import (`import '@tanstack/react-start/server-only'`) declares
    // the module's environment: it evaluates nothing
    const markers = this.opts.markerSpecifiers ?? DEFAULT_MARKERS
    const isMarker = (spec: string) => ownEntry(markers, spec) !== undefined
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
      codeEffects: effects.code,
      ...(effects.erasedImports && {
        erasedImports: {
          client: [...effects.erasedImports.client],
          server: [...effects.erasedImports.server],
        },
      }),
    }
    return {
      summary,
      targetFacts: { ...tf, digest: digestOf(tf) },
    }
  }
}
