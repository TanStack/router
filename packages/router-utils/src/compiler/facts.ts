/**
 * `RawFacts`: the one owner of raw module text per canonical id (see
 * README.md, "Caches and invalidation"). Serves summaries (raw domain) and J6
 * target facts (marker, export names, imports) from the same
 * read. Content-addressed, lazily built, invalidated by the watcher through
 * `markStale`.
 *
 * Identity and invalidation contract. An entry holds the facts of one text,
 * and is invalidated by what can change that text:
 * - a file's text, one entry per canonical id for every environment (a file
 *   reads the same for all of them): its file events (`invalidate`);
 * - a virtual module's text (`isVirtualId`), one entry per environment and
 *   id: each environment's bundler loads the id itself (`loadVirtual`; a
 *   plugin's `load` may answer each environment differently, and a compile
 *   must read its own environment's answer, R36). No file event names it:
 *   the host's own update of the module does (Vite: a hot update listing
 *   the module or a virtual importer of the event's file,
 *   `staleHotUpdate`), through `invalidate` with the id as its path, which
 *   reaches the entries of every environment (`byPath`). A Vite watch
 *   rebuild tells nothing: it expires its environment's (`expireVirtual`).
 * A resolution's change is not a fact of this cache: `invalidate` asks the
 * resolutions concerned again (a file appearing, a file removed).
 *
 * Rule: anything that changes an answer of `RawFactsCache` goes through
 * `markStale`, `forget`, `retain`, `expireVirtual` or `releaseVirtual`. They
 * move `version`, and a plan whose facts were validated at the current
 * version is not asked again (`CacheEntry.factsAt`), so a change made any
 * other way serves stale plans.
 * That includes a file a read found missing: its facts are not kept, and the
 * host that saw the miss marks it stale when the file may have appeared. A
 * virtual module's miss is kept, as its text would be (no file event names
 * it).
 */
import { digestOf, identify, isCommonJsPath, revision } from './identity'
import { parseModule } from './source'
import { DEFAULT_MARKERS, ModuleAnalysis } from './analysis'
import { buildSummary, exportKeysOf } from './summary'
import { ownEntry } from './strings'
import { EMPTY_RECOGNIZER, isKnownSpecifier } from './values'
import { approxBytes, cacheDisabled } from './stats'
import type { JsxDialect } from './analysis'
import type { ModuleSummary } from './summary'
import type { ParseModuleOptions } from './source'
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
  /** Its directive prologue holds `'use client'`: where server components render, an import of it is a client reference. */
  useClient: boolean
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
  /** A file's text, null when it cannot be read (missing, deleted mid-read, any error): it never rejects. */
  readFile: (path: string) => Promise<string | null>
  /**
   * A virtual id's text, loaded by the environment that asks for its facts:
   * it resolved the id, while another environment's bundler may not own it
   * (asking one that runs concurrently, e.g. in `vite build --watch`, fails
   * that build). `null`: the host has no such module (a miss, kept as a
   * text would be). A load that throws is no evidence: read as missing for
   * that read, its entry kept without facts, read again at every ask.
   */
  loadVirtual: (id: string, env: string) => Promise<string | null>
  recognizer?: RecognizerTable
  markerSpecifiers?: Record<string, 'server-only' | 'client-only'>
  /** The JSX dialect every analysis of the session reads (`ModuleAnalysis`'s `jsx`). */
  jsx?: JsxDialect
  /**
   * Whether a module is opaque to the summaries, by its path (a host's
   * pre-bundled dependency). An opaque module gets no summary: it is null
   * (`unknown` to a resolver), its marker is read from the text, and its
   * target facts are parsed only when asked (`getTarget`).
   */
  opaque?: (path: string) => boolean
  /**
   * A file's modification time in milliseconds (null: unknown; a whole
   * number of seconds counts as unknown). Without it, every file event that
   * reads a file empty waits for its text (`readChange`).
   */
  modifiedAt?: (path: string) => Promise<number | null>
}

/**
 * A module's text as a read found it: null when the module is missing (a
 * file that does not exist, a virtual module its host has no text for),
 * `undefined` when its host's `loadVirtual` threw: no evidence of either,
 * read as missing for that read; its entry stays without facts, so every
 * read loads it again and an expiry or a change event finds it.
 */
type Text = string | null | undefined

/** Whether a module is virtual: its raw text is the host's `loadVirtual`, not a file's. */
export const isVirtualId = (canonicalId: string): boolean =>
  canonicalId.startsWith('\0') || canonicalId.startsWith('virtual:')

/**
 * How the summaries parse a module (null: not at all): a virtual module
 * without an extension parses as TypeScript without JSX (which reads any
 * JavaScript but JSX), a file without a language is not parsed.
 */
export function summaryParse(canonicalId: string): ParseModuleOptions | null {
  const id = identify(canonicalId)
  if (id.lang === null && !isVirtualId(canonicalId)) {
    return null
  }
  return {
    lang: id.lang ?? 'ts',
    path: id.path,
    sourceType: isCommonJsPath(id.path) ? 'commonjs' : undefined,
  }
}

/** The target facts of an opaque module before anyone asks for them: exists, no marker, otherwise unknown. */
const OPAQUE_TARGET: Omit<TargetFacts, 'digest'> = {
  exists: true,
  marker: null,
  exportNames: [],
  stars: [],
  imports: [],
  lazyImports: [],
  esm: false,
  useClient: false,
}

const MISSING_TARGET: Omit<TargetFacts, 'digest'> = {
  exists: false,
  marker: null,
  exportNames: [],
  stars: [],
  imports: [],
  lazyImports: [],
  esm: false,
  useClient: false,
}

/** The target facts of a module that does not parse: it exists, nothing else is known. */
const UNREADABLE_TARGET: TargetFacts = (() => {
  const tf: Omit<TargetFacts, 'digest'> = {
    exists: true,
    marker: null,
    exportNames: [],
    stars: [],
    imports: [],
    lazyImports: [],
    esm: false,
    useClient: false,
  }
  return { ...tf, digest: digestOf(tf) }
})()

/** (computed once: an opaque module's read is on every pre-bundled module's path) */
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
  /** The module's canonical id (the entry's key is the id and, for a virtual module, the environment: `keyOf`). */
  readonly id: string
  stale: boolean
  facts: RawFacts | null
  pending: Promise<RawFacts> | null
  /** Whether the text since the last `markStale` holds no marker literal (`marker` answered without a parse). */
  markerless: boolean
  /**
   * The text of the entry's next build: a read in flight, or the text a
   * file event read (`readChange`). `get` and `marker` share it, and the
   * first of them to have it takes it (`takeText`).
   */
  reading: Promise<Text> | null
}

/** A file event's read of a file (`readChange`): its text and the text's `revision` (null: the file is gone). */
export type EventRead =
  | { text: string; revision: string }
  | { text: null; revision: null }

export class RawFactsCache {
  /** Entry key (`keyOf`) → entry. */
  private readonly entries = new Map<string, FactsEntry>()
  /** Path → keys of `entries` at it (`markStale`/`forget` without a scan; every environment's entry of a virtual id). */
  private readonly byPath = new Map<string, Set<string>>()
  /**
   * `TSR_COMPILER_NO_CACHE=facts|targets`: every read rebuilds (measurement
   * knobs); `facts` keeps each entry for all but its reuse, and both keep
   * the facts a file last parsed to while it does not parse.
   */
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
   * Path → the modification time of the file (null: unknown) when a file
   * event's read found it empty and waited for its text in vain
   * (`readChange`): an event that finds it so again at a known time is a
   * repeat of that one, and a reader does not wait again (`maySave`).
   */
  private readonly emptyAt = new Map<string, number | null>()
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

  /** The JSX dialect every analysis of this session reads. */
  get jsx(): JsxDialect | undefined {
    return this.opts.jsx
  }

  /**
   * Marks the facts at `path` stale. `read`: what a file event read
   * (`readChange`): the path's text from now on, which the entries' next
   * builds take instead of reading the file again.
   */
  markStale(path: string, read?: EventRead): void {
    this.changes++
    // (with the facts knob off too: an event's empty read is what `maySave`
    // asks of the file)
    if (read !== undefined) {
      if (read.text === null) {
        this.seen.delete(path)
        this.emptyAt.delete(path)
      } else {
        this.seen.set(path, read.revision)
      }
    }
    for (const key of this.byPath.get(path) ?? []) {
      const e = this.entries.get(key)!
      e.stale = true
      // a read in flight may hold the text from before the event: it is not published
      e.pending = null
      e.markerless = false
      e.reading = read === undefined ? null : Promise.resolve(read.text)
    }
  }

  /**
   * Whether the cache holds anything read of `path`, or reads it now: an
   * event of a path it does not know changes no answer of it.
   */
  knows(path: string): boolean {
    return this.byPath.has(path) || this.seen.has(path) || this.reads.has(path)
  }

  /** Whether the cache holds facts of `path`, or reads it now (what `seen` alone records is no fact). */
  holds(path: string): boolean {
    return this.byPath.has(path) || this.reads.has(path)
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
   * that event, through another hook), or `dependedOn` says nothing depends
   * on the file's text (an empty read of it changes no answer: a later
   * write is read when something reads the file). The same text proves that no fact of
   * the file moved, not that the file was there all along: the caller still
   * moves the file set for an `add` or a removal.
   */
  async readChange(
    path: string,
    readable: boolean,
    dependedOn: () => boolean,
  ): Promise<EventRead & { same: boolean }> {
    const seen = () => this.seen.get(path)
    let text: string | null = ''
    if (readable) {
      text = await this.readEvent(path)
      // (`emptyAt` holds the path only while this event's read is the one
      // that waited in vain, or a repeat of it)
      let waitedInVain = false
      if (text === '' && dependedOn()) {
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
          if (text === '') {
            this.emptyAt.set(path, at)
            waitedInVain = true
          }
        } else {
          waitedInVain = true
        }
      }
      if (!waitedInVain) {
        this.emptyAt.delete(path)
      }
    }
    if (text === null) {
      return { text, revision: null, same: false }
    }
    const rev = readable ? revision(text) : EMPTY_REVISION
    const same = !this.noFacts && seen() === rev && !this.reads.has(path)
    return { text, revision: rev, same }
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
    for (const key of [...(this.byPath.get(path) ?? [])]) {
      // a read in flight is not published
      const e = this.entries.get(key)!
      e.pending = null
      e.reading = null
      this.deleteEntry(key)
    }
  }

  /**
   * The key of a module's entry: its canonical id, and the environment for
   * a virtual module (each environment loads its own text: see the
   * contract above).
   */
  private keyOf(canonicalId: string, env: string): string {
    return isVirtualId(canonicalId) ? `${env}\u0000${canonicalId}` : canonicalId
  }

  private setEntry(key: string, e: FactsEntry): void {
    if (!this.entries.has(key)) {
      const path = identify(e.id).path
      let keys = this.byPath.get(path)
      if (!keys) {
        keys = new Set()
        this.byPath.set(path, keys)
      }
      keys.add(key)
    }
    this.entries.set(key, e)
  }

  private deleteEntry(key: string): void {
    const e = this.entries.get(key)
    if (!e) {
      return
    }
    this.entries.delete(key)
    const path = identify(e.id).path
    const keys = this.byPath.get(path)
    if (keys) {
      keys.delete(key)
      if (keys.size === 0) {
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
    for (const [key, e] of this.entries) {
      if (!keep(e.id)) {
        this.changes++
        e.pending = null
        e.reading = null
        this.deleteEntry(key)
        const path = identify(e.id).path
        if (!this.byPath.has(path)) {
          this.seen.delete(path)
          this.emptyAt.delete(path)
        }
      }
    }
  }

  /**
   * Marks the virtual modules environment `env` read stale (the host's
   * `expireVirtual`); returns their paths.
   */
  expireVirtual(env: string): Set<string> {
    const paths = new Set<string>()
    for (const [key, e] of this.entries) {
      if (key.startsWith(`${env}\u0000`)) {
        this.changes++
        e.stale = true
        e.pending = null
        e.markerless = false
        e.reading = null
        paths.add(identify(e.id).path)
      }
    }
    return paths
  }

  /** Drops the virtual modules environment `env` read (no other environment reads them: `keyOf`). */
  releaseVirtual(env: string): void {
    for (const [key, e] of this.entries) {
      if (key.startsWith(`${env}\u0000`)) {
        this.changes++
        e.pending = null
        e.reading = null
        this.deleteEntry(key)
      }
    }
  }

  /** The facts of a module, read (on a miss) for environment `env`. */
  get(canonicalId: string, env: string): Promise<RawFacts> {
    return this.factsOf(canonicalId, env, null)
  }

  /** `get`; `taken`: the entry's text a reader already took (`takeText`), built from on a miss. */
  private async factsOf(
    canonicalId: string,
    env: string,
    taken: Promise<Text> | null,
  ): Promise<RawFacts> {
    const key = this.keyOf(canonicalId, env)
    let e = this.entries.get(key)
    // (`noFacts`: the entry is kept for all but its reuse: a file that stops
    // parsing keeps the facts it last parsed to, as with the cache on)
    if (e && e.facts && !e.stale && !this.noFacts) {
      this.counters.factsHits++
      return e.facts
    }
    if (this.isKnownSpecifier(canonicalId)) {
      const facts = this.knownFacts(canonicalId)
      this.setEntry(key, this.entryOf(canonicalId, facts))
      return facts
    }
    if (e?.pending) {
      return e.pending
    }
    if (!e) {
      e = this.entryOf(canonicalId, null)
      this.setEntry(key, e)
    }
    const entry = e
    const holder: { p: Promise<RawFacts> | null } = { p: null }
    holder.p = (async () => {
      const prior = entry.facts
      const text = await this.readSaved(
        canonicalId,
        env,
        prior,
        taken ?? this.takeText(entry, canonicalId, env),
      )
      const built = this.build(canonicalId, text ?? null)
      // A file that stops parsing (saved mid-edit) keeps the last facts it
      // parsed to: its importers' decisions stand until it parses again (a
      // changed digest would evict their plans and hot-update modules that
      // cannot accept, e.g. a route tree, into a full reload). A file that
      // never parsed is unknown. One that still reads empty after
      // `readSaved`'s retries is empty.
      const facts =
        text != null &&
        !built.opaque &&
        prior?.summary &&
        built.summary === null
          ? prior
          : built
      // a newer read may have superseded this one
      if (entry.pending === holder.p) {
        // (a load that threw is no fact: the entry stays, without facts, so
        // that every read loads it again and an expiry or a change event of
        // the module finds it)
        entry.facts = text === undefined ? null : facts
        entry.stale = false
        entry.pending = null
        if (
          text === null &&
          !isVirtualId(canonicalId) &&
          this.entries.get(key) === entry
        ) {
          // a missing file's facts are not kept (`forget`): its creation
          // has an event. A virtual module's miss is kept: no file event
          // names it, only its host's update or `expireVirtual` does
          this.deleteEntry(key)
        }
      }
      return facts
    })()
    entry.pending = holder.p
    return holder.p
  }

  private entryOf(canonicalId: string, facts: RawFacts | null): FactsEntry {
    return {
      id: canonicalId,
      stale: false,
      facts,
      pending: null,
      markerless: false,
      reading: null,
    }
  }

  /**
   * The entry's text, the one read path of its readers (`get`, `marker`):
   * a read in flight, or a change event's text (`markStale`), is shared by
   * the readers that ask meanwhile and taken once, here: the next ask reads
   * the module again.
   */
  private async takeText(
    entry: FactsEntry,
    canonicalId: string,
    env: string,
  ): Promise<Text> {
    const reading = (entry.reading ??= this.read(canonicalId, env))
    try {
      return await reading
    } finally {
      if (entry.reading === reading) {
        entry.reading = null
      }
    }
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
    const key = this.keyOf(canonicalId, env)
    const e = this.entries.get(key)
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
    // (kept with the knob off too, as `get` keeps its entries under
    // `noFacts`: an expiry or a change event of the module finds it)
    const entry = e ?? this.entryOf(canonicalId, null)
    if (!e) {
      this.setEntry(key, entry)
    }
    // (an event meanwhile supersedes what this read concludes)
    const changes = this.changes
    const taken = this.takeText(entry, canonicalId, env)
    const text = await taken
    // (an empty read of a file that held a module goes to `get`, which
    // reads it again for a moment: `readSaved`. A file event checks the
    // importers' markers at once, maybe while an in-place save has the
    // file empty)
    if (
      text != null &&
      (this.mayHaveMarker(text) ||
        (text === '' && this.maySave(canonicalId, entry.facts)))
    ) {
      // (the target facts are built from the text taken here, one read,
      // unless an event landed meanwhile: that text may be from before it,
      // and the target facts take the text current now)
      return (
        await this.targetOf(
          canonicalId,
          env,
          this.changes === changes ? taken : null,
        )
      ).targetFacts.marker
    }
    if (this.changes === changes) {
      if (
        text !== undefined &&
        (text !== null || isVirtualId(canonicalId)) &&
        !this.noTargets
      ) {
        // (a virtual module's miss is kept as its text would be: no file
        // event names it, only its host's update or `expireVirtual`. A load
        // that threw is no evidence: its entry stays, not markerless)
        entry.markerless = true
      } else if (
        text === null &&
        !isVirtualId(canonicalId) &&
        !entry.facts &&
        this.entries.get(key) === entry
      ) {
        // a missing file is not kept (`forget`); a load that threw keeps
        // its entry, not markerless: read again at the next ask
        this.deleteEntry(key)
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
  getTarget(canonicalId: string, env: string): Promise<RawFacts> {
    return this.targetOf(canonicalId, env, null)
  }

  /** `getTarget`; `taken`: as `factsOf`'s. */
  private async targetOf(
    canonicalId: string,
    env: string,
    taken: Promise<Text> | null,
  ): Promise<RawFacts> {
    if (this.noTargets && !this.isKnownSpecifier(canonicalId)) {
      // the entry as `get` keeps it, and the target facts rebuilt from a
      // fresh read, but for a file that stops parsing: it keeps the facts it
      // last parsed to, as with the knob off
      const kept = await this.factsOf(canonicalId, env, taken)
      const text = await this.read(canonicalId, env)
      const built = this.build(canonicalId, text ?? null, true)
      return text != null &&
        !built.opaque &&
        built.summary === null &&
        kept.summary
        ? kept
        : built
    }
    const facts = await this.factsOf(canonicalId, env, taken)
    if (!facts.opaque) {
      return facts
    }
    // an opaque module's target facts are asked for (a mock of it): parsed
    // now, once. Its summary stays null: the module is opaque to the
    // summaries whether or not a mock asked about it, so the digest plans
    // recorded (`null`) stays current and nothing is evicted by the question
    const key = this.keyOf(canonicalId, env)
    const e = this.entries.get(key)
    const text = await (taken ?? this.read(canonicalId, env))
    const full: RawFacts = {
      ...this.build(canonicalId, text ?? null, true),
      summary: null,
    }
    if (e && this.entries.get(key) === e && e.facts === facts) {
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
      exportFacts[name] = { kind: 'local', local: name, value }
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
      useClient: false,
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

  /**
   * The module's text; '' for a file that is no JavaScript (an asset,
   * `?url`): never read, `build` describes it unanalysed. A virtual
   * module's load that threw is `undefined`: no evidence (`Text`).
   */
  private async read(canonicalId: string, env: string): Promise<Text> {
    if (isVirtualId(canonicalId)) {
      this.counters.factsReads++
      try {
        return await this.opts.loadVirtual(canonicalId, env)
      } catch {
        return undefined
      }
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
    if (text !== '') {
      // (a read that found text, or no file, ends what an event's empty
      // read confirmed: `maySave`)
      this.emptyAt.delete(path)
    }
    if (!this.noFacts) {
      // (in the same step as the read's end: an event never finds a read
      // that ended and is not in `seen`)
      // (the text is hashed only to check an event's: a cold read is not)
      const seen = this.seen.get(path)
      if (text === null) {
        this.seen.delete(path)
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
    first: Promise<Text>,
  ): Promise<Text> {
    let text = await first
    if (text !== '' || !this.maySave(canonicalId, prior)) {
      return text
    }
    for (let n = 0; n < SAVE_RETRIES && text === ''; n++) {
      await new Promise((resolve) => setTimeout(resolve, SAVE_RETRY_MS))
      text = await this.read(canonicalId, env)
    }
    return text
  }

  /**
   * Whether an empty read of a module may be its in-place save between the
   * truncation and the write (`readSaved` reads it again for a moment): its
   * file held a module (`prior`), or the last event of the file read it
   * empty without waiting for its text (the event is no evidence that it
   * is empty: a compile that reads it after the event waits for the text).
   * An event that waited in vain (`emptyAt`) is: the file is empty, and
   * no reader waits again for that event. A file the
   * compiler does not read (an asset, `?raw`: no language) reads as `''`
   * and never waits.
   */
  private maySave(canonicalId: string, prior: RawFacts | null): boolean {
    const id = identify(canonicalId)
    if (isVirtualId(canonicalId) || id.lang === null) {
      return false
    }
    return (
      !this.emptyAt.has(id.path) &&
      ((prior !== null && this.heldModule(canonicalId, prior)) ||
        this.seen.get(id.path) === EMPTY_REVISION)
    )
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
    const parse = summaryParse(canonicalId)
    if (!full && this.opts.opaque?.(id.path) && !this.mayHaveMarker(text)) {
      return {
        summary: null,
        targetFacts: { ...OPAQUE_TARGET, digest: OPAQUE_DIGEST },
        opaque: true,
      }
    }
    // (a module whose analysis cannot be built, e.g. a chain too deep for
    // the value analysis' recursion, is read as one that does not parse:
    // its importer's compile is not its to fail)
    try {
      const parsed = parse === null ? null : parseModule(text, parse)
      if (parsed?.ok) {
        const analysis = new ModuleAnalysis(parsed.file, parsed.source, {
          path: id.path,
          markerSpecifiers: this.opts.markerSpecifiers,
          jsx: this.opts.jsx,
        })
        return this.fromAnalysis(analysis)
      }
    } catch {
      // read below as a module without facts
    }
    return { summary: null, targetFacts: { ...UNREADABLE_TARGET } }
  }

  private fromAnalysis(analysis: ModuleAnalysis): RawFacts {
    const summary = buildSummary(
      analysis,
      this.opts.recognizer ?? EMPTY_RECOGNIZER,
    )
    const exportNames = Object.keys(summary.exports).sort()
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
      useClient: analysis.header.directives.some(
        (d) => d.value === 'use client',
      ),
    }
    return {
      summary,
      targetFacts: { ...tf, digest: digestOf(tf) },
    }
  }
}
