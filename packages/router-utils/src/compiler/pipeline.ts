/**
 * `compileModule()` — phases A–D with the restart loop (README.md,
 * "Pipeline"). A: identify, validated cache lookup, parse (Tier 0), gates,
 * prefetch. B: synchronous planning and freeze. C: per-output edge policy,
 * snapshot validation, publication. D: emission on demand.
 */
import {
  deriveId,
  edgeKeyOf,
  identify,
  isCommonJsPath,
  langFromId,
  revision,
} from './identity'
import { parseModule } from './source'
import { ModuleAnalysis } from './analysis'
import { AnalysisPlan } from './plan'
import {
  DependencyLedger,
  EXTERNAL_RESOLUTION,
  StaleSets,
  stable,
} from './cache'
import { emitRecipe, substituteSpecifier } from './emit'
import { dedupeEdges, sourceEdges, wholeModule } from './edges'
import { SourceText } from './output-builder'
import { displayPath } from './diagnostics'
import { ExportResolver } from './resolve'
import {
  dependencyPaths,
  fingerprintSourceFor,
  planCacheFor,
  resolveForAnalysis,
} from './host'
import { isVirtualId } from './facts'
import { registerCompilerStats } from './stats'
import { exportKeyOf, summaryDigest } from './summary'
import {
  SELF_CHECKS,
  internalError,
  invariantDiagnostic,
  invariantViolated,
  reportedError,
} from './self-checks'
import { verifyPlan } from './verify'
import { checkServerCode } from './server-code'
import type { CacheEntry, Settled, SettledAt } from './cache'
import type { RawSourceMap } from './output-builder'
import type { Diagnostic } from './diagnostics'
import type { Range } from './header'
import type {
  EmitPlan,
  EnvInfo,
  FallbackRecord,
  FrozenPlan,
  OutputRecipe,
  PlanContext,
  PlanEdges,
} from './plan'
import type { PlanKey, SourceIdentity } from './identity'
import type { OutputId } from './rewrite'
import type {
  CompileInput,
  CompileOutput,
  CompilerCaches,
  HostServices,
  InputSourceMap,
  Planner,
  PlannerPrefetches,
  PolicyContext,
  PrefetchContext,
} from './host'

const MAX_ATTEMPTS = 3

/** The caches of one compiler session; `label` names them in `compilerStats()`. */
export function createCompilerCaches(
  rawFacts: HostServices['rawFacts'],
  label = 'compiler',
  opts: { removed?: (path: string) => void } = {},
): CompilerCaches {
  const invalidations = new Map<string, Promise<unknown>>()
  const caches: CompilerCaches = {
    plans: new Map(),
    rawFacts,
    fileSetVersion: 0,
    stale: new StaleSets(),
    invalidations,
    removed: opts.removed,
    settled: async () => {
      while (invalidations.size > 0) {
        await Promise.allSettled([...invalidations.values()])
      }
    },
  }
  registerCompilerStats(label, caches, readCacheStats)
  return caches
}

function readCacheStats(c: CompilerCaches) {
  const withBytes = process.env.TSR_COMPILER_STATS_BYTES !== '0'
  const out: Record<string, number> = {
    ...c.rawFacts.stats(withBytes),
    ...c.stale.stats(),
    invalidationsRunning: c.invalidations.size,
  }
  for (const plans of c.plans.values()) {
    for (const [k, v] of Object.entries(plans.stats(withBytes))) {
      out[k] = (out[k] ?? 0) + v
    }
  }
  return out
}

type AttemptResult =
  | Exclude<Settled, { kind: 'plan' }>
  | { kind: 'plan'; plan: EmitPlan }

/**
 * What one request of a host id settled on, read while the request is open
 * (`settleModule`): the module untouched (every gate failed, non-ESM,
 * non-JS id), or compiled (a parse error too). A derived id of an untouched
 * module, or one whose plan has no such output, is compiled to the empty
 * module (`export {}\n`).
 *
 * `current()`: no newer answer of the key exists. The key's latest text is
 * the request's and its generation is the one the answer was taken at (a
 * request of another text, a file event, a removal or an eviction moves
 * it). Sibling outputs of one text share a generation. It is read in the
 * turn of a shared write: a host writes shared state (a registry, import
 * protection's records) only for a current answer.
 */
export type Settlement = (
  | { kind: 'untouched' }
  | { kind: 'compiled'; output: CompileOutput }
) & { current: () => boolean }

/**
 * Settles one host id and runs `use` with the settlement while the request
 * is open: the key stays live (its generation known) until `use` ends.
 * Gives what `use` returns.
 */
export async function settleModule<T>(
  input: CompileInput,
  host: HostServices,
  caches: CompilerCaches,
  use: (settlement: Settlement) => T | Promise<T>,
): Promise<T> {
  const own = identify(input.id)
  // a non-JS id whose code reaches us as JS (`.vue`, `.mdx`) compiles with
  // Tier 0 only, or in place (`inPlace`)
  const tier0Only = own.lang === null && input.inPlace !== true
  const identity =
    own.lang === null && input.lang ? { ...own, lang: input.lang } : own
  if (identity.lang === null) {
    // no key: nothing the core keeps of it, nothing to overtake it
    return use({ kind: 'untouched', current: () => true })
  }
  const env = input.env
  const cache = planCacheFor(caches, env.name)
  const key: PlanKey = {
    env: env.name,
    canonicalId: identity.canonicalId,
    configKey: input.config.configKey,
  }
  const rev = revision(input.code)
  const requested = outputOf(identity)
  // the request's text is the key's latest from its arrival on: a request
  // of another text arriving later supersedes it, whatever this one waits on
  // (the key stays live until it ends, so its latest revision and its
  // generation stay known)
  cache.begin(key, rev)
  try {
    let answered: { out: CompileOutput | null; generation: number }
    try {
      answered = await answer(
        input,
        identity,
        tier0Only,
        host,
        caches,
        key,
        rev,
        requested,
      )
    } catch (error) {
      // the one place an internal error becomes one to report
      throw reportedError(
        error,
        tagOf(host),
        displayPath(identity.path, host.root),
      )
    }
    const { out, generation } = answered
    const current = () =>
      cache.latestRevision(key) === rev && cache.generation(key) === generation
    if (out) {
      return await use({ kind: 'compiled', output: out, current })
    }
    if (identity.derived) {
      return await use({
        kind: 'compiled',
        output: emptyModule(identity, input, requested),
        current,
      })
    }
    return await use({ kind: 'untouched', current })
  } finally {
    cache.end(key)
  }
}

/**
 * Holds a key live while `use` runs, for a host's request the core does not
 * compile (an asset id a host judges by its file's facts alone): it has no
 * text of its own, so `current()` says that no event of the key's file
 * (`invalidate`: the file's text moved) and no request of another revision
 * came since it began. Two requests of one key with no event between them
 * are both current.
 */
export async function holdKey<T>(
  caches: CompilerCaches,
  key: PlanKey,
  use: (current: () => boolean) => T | Promise<T>,
): Promise<T> {
  const cache = planCacheFor(caches, key.env)
  cache.begin(key, HELD_REVISION)
  const generation = cache.generation(key)
  try {
    return await use(
      () =>
        cache.latestRevision(key) === HELD_REVISION &&
        cache.generation(key) === generation,
    )
  } finally {
    cache.end(key)
  }
}

/** The revision of a held key (`holdKey`): no text's. */
const HELD_REVISION = '\u0000held'

/**
 * The empty module, the code and map of a derived id whose module has no
 * such output (an untouched module, a plan without it, a file that is no
 * longer a route module). Its map maps nothing (`wantMap`): a map upstream
 * of the compiler does not reach the module through it.
 */
export function emptyModuleOutput(
  path: string,
  wantMap: boolean,
): { code: string; map: RawSourceMap | null } {
  return {
    code: 'export {}\n',
    map: wantMap
      ? { version: 3, sources: [path], names: [], mappings: '' }
      : null,
  }
}

/** A derived id's output when its module has none (`emptyModuleOutput`). */
function emptyModule(
  identity: SourceIdentity,
  input: CompileInput,
  requested: OutputId,
): CompileOutput {
  return {
    ...emptyModuleOutput(identity.path, input.wantMap),
    facts: { marker: null, planners: {} },
    diagnostics: [],
    dependencies: [],
    persisted: null,
    output: requested,
  }
}

/**
 * Compiles one host id (`settleModule`'s answer): null when untouched.
 */
export function compileModule(
  input: CompileInput,
  host: HostServices,
  caches: CompilerCaches,
): Promise<CompileOutput | null> {
  return settleModule(input, host, caches, (s) =>
    s.kind === 'compiled' ? s.output : null,
  )
}

/**
 * The output of a request of `key` at revision `rev`, from a validated plan
 * hit, a compile in flight or its own compile, and the key's generation when
 * the core took it (the hit's accepting turn, the compile's settling turn).
 */
async function answer(
  input: CompileInput,
  identity: SourceIdentity,
  tier0Only: boolean,
  host: HostServices,
  caches: CompilerCaches,
  key: PlanKey,
  rev: string,
  requested: OutputId,
): Promise<{ out: CompileOutput | null; generation: number }> {
  const env = input.env
  const cache = planCacheFor(caches, env.name)
  const note = await textDiffers(
    cache.get(key),
    rev,
    requested,
    identity,
    env,
    host,
  )
  const noted = <T extends CompileOutput | null>(out: T): T =>
    note && out ? { ...out, diagnostics: [...out.diagnostics, note] } : out

  for (;;) {
    const hit = cache.lookup(key, rev)
    if (hit) {
      // what was checked at the current versions stands (not asked again)
      const checked = await stable(
        hit.plan.dependencies,
        fingerprintSourceFor(caches, host, env.name),
        caches,
        hit,
        {
          still: () => cache.lookup(key, rev) === hit,
          accept: (at) => {
            hit.resolvedAt = at.resolvedAt
            hit.factsAt = at.factsAt
            cache.counters.planHits++
            return {
              out: noted(emitFrom(hit, requested, input, caches)),
              generation: cache.generation(key),
            }
          },
          refuse: (fact) => {
            cache.delete(key)
            // this request compiles the file again; its other outputs,
            // which the bundler holds from the plan, follow
            caches.stale.add(env.name, identity.path)
            if (caches.invalidations.size === 0) {
              // `invalidate()` checks every fact again, and leaves
              // resolutions and route-registry digests to the next request
              cache.counters[fact ? 'staleHits' : 'lazyHits']++
            }
          },
        },
      )
      if (checked.kind === 'accepted') {
        return checked.value
      }
      // refused, or evicted (and published again) meanwhile: look again
      continue
    }
    const flight = cache.flight(key)
    if (flight && flight.revision === rev) {
      // another request of this text is compiling it: its outcome answers this request too
      const shared = await flight.settled.catch(() => null)
      if (shared) {
        return {
          out: noted(emitSettled(shared.settled, requested, input, caches)),
          generation: shared.generation,
        }
      }
      // it threw: its request reports the error, this one compiles on its own
      continue
    }
    const record = {
      revision: rev,
      settled: settle(input, identity, tier0Only, host, caches, key, rev),
    }
    cache.fly(key, record)
    try {
      const own = await record.settled
      return {
        out: noted(emitSettled(own.settled, requested, input, caches)),
        generation: own.generation,
      }
    } finally {
      cache.land(key, record)
    }
  }
}

function outputOf(identity: SourceIdentity): OutputId {
  return identity.derived
    ? `derived:${deriveId(identity.canonicalId, identity.derived)}`
    : 'env'
}

/** How long before a dev compile a file must have been saved for that compile to have read it. */
const DEV_READ_WINDOW_MS = 2_000

/**
 * The warning when another output of this file was compiled from another text
 * while the file stayed as it was: a plugin before the compiler handled the
 * ids differently, typically an id filter anchored with `$` that skips the
 * query of a derived id. Each id compiles from its own text, so their plans
 * can place one binding differently. A save between the two explains a
 * difference too, and that is what the file's modification time rules out; in
 * dev the window leaves room for a text read just before a save. A plan
 * compiled for this output says nothing (no other id's text), and the cost is
 * one comparison per compile, plus a `stat` when the texts differ.
 */
async function textDiffers(
  previous: CacheEntry | null,
  rev: string,
  requested: OutputId,
  identity: SourceIdentity,
  env: CompileInput['env'],
  host: HostServices,
): Promise<Diagnostic | null> {
  if (
    !previous ||
    previous.revision === rev ||
    previous.compiledFor === requested ||
    !host.modifiedAt
  ) {
    return null
  }
  const modifiedAt = await host.modifiedAt(identity.path)
  const settled = env.mode === 'dev' ? DEV_READ_WINDOW_MS : 0
  if (modifiedAt === null || modifiedAt + settled > previous.compiledAt) {
    return null
  }
  return {
    severity: 'warning',
    by: 'core',
    code: 'input-text-differs',
    message: `${tagOf(host)}${displayPath(identity.path, host.root)} reaches the compiler with different code under its module ids: a plugin that runs before the compiler transforms only some of them (an id filter ending in \`$\` skips ids with a query, such as the route's split chunks), so they are compiled from different code and can disagree at runtime. Let that plugin's id filter accept ids with a query (\`/\\.tsx(\\?|$)/\`).`,
  }
}

/**
 * Compiles a key at one revision: attempts until one is published or
 * superseded by a newer revision. An attempt whose dependencies changed
 * underneath it (snapshot validation, a generation bump) is retried, up to
 * `MAX_ATTEMPTS`.
 */
async function settle(
  input: CompileInput,
  identity: SourceIdentity,
  tier0Only: boolean,
  host: HostServices,
  caches: CompilerCaches,
  key: PlanKey,
  rev: string,
): Promise<SettledAt> {
  const cache = planCacheFor(caches, key.env)
  // (the request that started it keeps the key live: `compileModule`)
  let overtaken!: CacheEntry
  // every attempt compiles the text this compile was given
  const compiledAt = Date.now()
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const generation = cache.generation(key)
    const fileSetVersion = caches.fileSetVersion
    const factsVersion = caches.rawFacts.version
    const ledger = new DependencyLedger()
    const result = await runAttempt(
      input,
      identity,
      tier0Only,
      host,
      caches,
      ledger,
      rev,
    )
    if (result.kind !== 'plan') {
      if (cache.latestRevision(key) === rev && cache.holdsOther(key, rev)) {
        // the file's text has no plan: the plan of its old text, or a
        // restored one, goes with its rows (a later event of what it read
        // reports nothing)
        cache.delete(key)
      }
      return { settled: result, generation: cache.generation(key) }
    }
    const entry: CacheEntry = {
      key,
      revision: rev,
      generation,
      plan: result.plan,
      resolvedAt: fileSetVersion,
      factsAt: factsVersion,
      compiledFor: outputOf(identity),
      compiledAt,
    }
    entry.plan.dependencies = ledger.published()
    // the snapshot: whether every fact the attempt recorded is still
    // current (`stable`), and the key's generation unmoved since the
    // attempt began, in the turn that publishes
    const checked = await stable(
      entry.plan.dependencies,
      fingerprintSourceFor(caches, host, key.env),
      caches,
      entry,
      {
        // (a newer text, a removal or an eviction moved it)
        still: () => cache.generation(key) === generation,
        accept: (at) => {
          entry.resolvedAt = at.resolvedAt
          entry.factsAt = at.factsAt
          cache.set(entry)
        },
      },
    )
    if (checked.kind === 'accepted' || cache.latestRevision(key) !== rev) {
      // published, or superseded (a newer save, the file removed: never
      // published, but its requests are answered)
      return { settled: { kind: 'plan', entry }, generation: entry.generation }
    }
    overtaken = entry
  }
  // Every attempt was overtaken (a save storm, a checkout touching several
  // dependencies): the last plan answers without being published, so the
  // next request compiles afresh, and the file enters its stale set: the
  // host has its modules built again (Rsbuild and webpack at once, Vite
  // with the next file event's hot update)
  caches.stale.add(key.env, identity.path)
  return {
    settled: { kind: 'plan', entry: overtaken },
    generation: cache.generation(key),
  }
}

/** A request's output from what the compile of its text settled on. */
function emitSettled(
  settled: Settled,
  requested: OutputId,
  input: CompileInput,
  caches: CompilerCaches,
): CompileOutput | null {
  if (settled.kind === 'untouched') {
    return null
  }
  if (settled.kind === 'parse-error') {
    return {
      code: input.code,
      map: null,
      facts: { marker: null, planners: {} },
      diagnostics: settled.diagnostics,
      dependencies: [],
      persisted: null,
      output: requested,
    }
  }
  return emitFrom(settled.entry, requested, input, caches)
}

/** Emits the requested output from a frozen plan (never memoised: emission costs microseconds). */
function emitFrom(
  entry: CacheEntry,
  requested: OutputId,
  input: CompileInput,
  caches: CompilerCaches,
): CompileOutput {
  const plan = entry.plan
  const recipe = plan.outputs[requested]
  const emitted = recipe
    ? requested === 'env' && isIdentityRecipe(recipe, input.code)
      ? // every host passes an unchanged env module through (no map read):
        // no builder run and no word-level map over the whole text
        { code: input.code, map: null }
      : emitRecipe(
          recipe,
          new SourceText(input.code, { lines: input.lines }),
          input.wantMap,
        )
    : emptyModuleOutput(identify(input.id).path, input.wantMap)
  return {
    code: emitted.code,
    map: emitted.map,
    facts: plan.facts,
    diagnostics: plan.diagnostics,
    // read by the webpack-family hosts and by a Vite watch build only, once
    // per compile: computed on demand
    get dependencies() {
      return [...dependencyPaths(plan.dependencies, caches)]
    },
    persisted: { key: entry.key, dependencies: plan.dependencies },
    output: requested,
  }
}

/** Whether emitting `recipe` over `code` yields `code` itself (slices covering the whole text). */
function isIdentityRecipe(recipe: OutputRecipe, code: string): boolean {
  let at = 0
  for (const seg of recipe.segments) {
    if (seg.k !== 'slice' || seg.start !== at) {
      return false
    }
    at = seg.end
  }
  return at === code.length
}

async function runAttempt(
  input: CompileInput,
  identity: SourceIdentity,
  tier0Only: boolean,
  host: HostServices,
  caches: CompilerCaches,
  ledger: DependencyLedger,
  rev: string,
): Promise<AttemptResult> {
  const env = input.env
  const parsed = parseModule(input.code, {
    lang: identity.lang!,
    path: identity.path,
    sourceType: isCommonJsPath(identity.path) ? 'commonjs' : undefined,
  })
  if (!parsed.ok) {
    return { kind: 'parse-error', diagnostics: parsed.diagnostics }
  }
  const t0 = new ModuleAnalysis(parsed.file, parsed.source, {
    path: identity.path,
    markerSpecifiers: host.rawFacts.markerSpecifiers,
    jsx: host.rawFacts.jsx,
  })
  const cjs = t0.sourceType !== 'module' || isCommonJsPath(identity.path)
  const gateCtx = (p: Planner) => ({
    identity,
    config: input.config.perPlanner[p.name],
  })
  let planners = input.planners.filter((p) => p.gate(t0, gateCtx(p)))
  if (cjs || tier0Only) {
    planners = planners.filter((p) => p.tier === 0)
  }
  const displayFile = displayPath(identity.path, host.root)
  if (planners.length === 0) {
    return { kind: 'untouched' }
  }

  // ---- A: prefetch -----------------------------------------------------------
  const prefetched = new Map<string, unknown>()
  // One answer per fact for the whole attempt, however many reads ask it
  // (a dependency saved between two reads, and saved back before the check,
  // must not reach the plan as two texts): the first read's, which the
  // ledger records and the snapshot check asks again
  const answers = new Map<string, Promise<unknown>>()
  const once = <T>(id: string, read: () => Promise<T>): Promise<T> => {
    let answer = answers.get(id) as Promise<T> | undefined
    if (!answer) {
      answer = read()
      answers.set(id, answer)
    }
    return answer
  }
  const resolveFrom = (
    specifier: string,
    importer: string,
  ): Promise<string | null> =>
    once(`resolve\0${importer}\0${specifier}`, async () => {
      const resolved = await resolveForAnalysis(
        caches,
        host,
        env.name,
        importer,
        specifier,
      )
      if (env.mode === 'dev' && importer === identity.canonicalId) {
        // a dev server's pending requests get in between the resolutions
        // of the module's own imports, as they did while every resolution
        // was resolver I/O: an analysis answered from the memo in
        // microtasks alone makes a server function call during an edit
        // wait for the whole update (+3 ms). Following another module's
        // re-exports (a barrel) gives no turn: one per re-export only
        // slowed a barrel-heavy dev compile by a fifth
        await new Promise((turn) => setImmediate(turn))
      }
      ledger.record({
        kind: 'resolution',
        env: env.name,
        importer,
        specifier,
        resolved,
      })
      // an external has nothing readable behind it
      return resolved === EXTERNAL_RESOLUTION ? null : resolved
    })
  /** A wait on a module's raw facts (`HostServices.awaitVirtual`). */
  const awaitFacts = <T>(canonicalId: string, read: Promise<T>): Promise<T> =>
    host.awaitVirtual && isVirtualId(canonicalId)
      ? host.awaitVirtual(canonicalId, read)
      : read
  const rawFactsOf = (canonicalId: string) =>
    once(`facts\0${canonicalId}`, () =>
      awaitFacts(canonicalId, host.rawFacts.get(canonicalId, env.name)),
    )
  const summaryOf = async (canonicalId: string) => {
    const facts = await rawFactsOf(canonicalId)
    ledger.record({
      kind: 'summary',
      canonicalId,
      digest: facts.summary ? summaryDigest(facts.summary) : null,
    })
    return facts.summary
  }
  // a lookup depends on the export it reads, not on the module's others
  const exportOf = async (canonicalId: string, name: string) => {
    const { summary } = await rawFactsOf(canonicalId)
    if (summary === null) {
      ledger.record({ kind: 'summary', canonicalId, digest: null })
    } else {
      ledger.recordExport(canonicalId, name, exportKeyOf(summary, name))
    }
    return summary
  }
  const targetFactsOf = async (canonicalId: string) => {
    const facts = await once(`target\0${canonicalId}`, () =>
      awaitFacts(canonicalId, host.rawFacts.getTarget(canonicalId, env.name)),
    )
    ledger.record({
      kind: 'target-facts',
      canonicalId,
      digest: facts.targetFacts.digest,
    })
    return facts.targetFacts
  }
  const targetMarkerOf = async (canonicalId: string) => {
    const marker = await once(`marker\0${canonicalId}`, () =>
      awaitFacts(canonicalId, host.rawFacts.marker(canonicalId, env.name)),
    )
    ledger.record({ kind: 'target-marker', canonicalId, marker })
    return marker
  }
  const resolver = new ExportResolver({
    summaryOf,
    exportOf,
    starsOf: (canonicalId, summary) =>
      ledger.recordStars(canonicalId, summary.stars),
    readableOf: async (canonicalId) => {
      const { summary } = await rawFactsOf(canonicalId)
      if (summary === null) {
        ledger.record({ kind: 'summary', canonicalId, digest: null })
      }
      return summary !== null
    },
    resolveSpecifier: (spec, importer) => resolveFrom(spec, importer),
  })
  const withdrawn = new Set<string>()
  await Promise.all(
    planners.map(async (p) => {
      if (!p.prefetch) {
        return
      }
      const ctx: PrefetchContext = {
        identity,
        host,
        ledger,
        resolver,
        resolve: (spec) => resolveFrom(spec, identity.canonicalId),
        resolveFrom,
        set: (data) => prefetched.set(p.name, data),
      }
      if ((await p.prefetch(t0, ctx)) === false) {
        withdrawn.add(p.name)
      }
    }),
  )
  if (withdrawn.size > 0) {
    // a withdrawn planner keeps its recorded dependencies: the (possibly verbatim)
    // plan is cached, so a dependency change can bring the module back
    planners = planners.filter((p) => !withdrawn.has(p.name))
  }

  // ---- B: planning (sync) ------------------------------------------------------
  const tier1Needed = planners.some((p) => p.tier === 1)
  let frozen: FrozenPlan
  if (!tier1Needed) {
    // the edge records' only readers are the planners' policies (phase C)
    frozen = tier0Plan(
      t0,
      identity,
      env,
      rev,
      planners.some((p) => p.policy !== undefined),
    )
  } else {
    // Planning rounds: the core reports the regions a split would break (a
    // chunk writing a binding the route module reads) and the planners
    // re-plan with them kept in place. A kept region can free the next one
    // (a chain of writers), so the rounds continue until no new region is
    // reported. Every planner answers a fallback by keeping that root in
    // place, so each round keeps at least one more region of the module and
    // the rounds end within the region count after the first round; going
    // past it is a compiler bug (an invariant).
    let fallbacks: Array<FallbackRecord> = []
    let plan!: AnalysisPlan
    let bound = 0
    for (let round = 0; ; round++) {
      plan = planRound(
        t0,
        identity,
        env,
        prefetched,
        fallbacks,
        planners,
        input,
        displayFile,
      )
      const fresh = plan
        .fallbackRecords()
        .filter(
          (f) =>
            !fallbacks.some(
              (g) =>
                g.range.start === f.range.start && g.range.end === f.range.end,
            ),
        )
      if (round === 0) {
        bound = plan.regions.regions.length
      }
      if (fresh.length === 0) {
        break
      }
      if (round >= bound) {
        plan.diagnostic(
          invariantDiagnostic(
            tagOf(host),
            displayFile,
            invariantViolated({
              effect: 'a split part may assign a binding the module reads',
              detail: `The planning rounds of ${identity.path} did not settle within ${bound} rounds (a planner did not keep a fallback's region in place)`,
              range: fresh[0]!.range,
            }),
          ),
        )
        break
      }
      fallbacks = [...fallbacks, ...fresh]
    }
    frozen = plan.freeze(rev)
    if (langFromId(input.id) === null && plan.outputs.size > 1) {
      throw internalError(
        `A plan of ${identity.path}, whose code is no JS/TS of its own, declared a derived output (it would load the file)`,
      )
    }
    checkServerCode(
      planners,
      (p) => withConfig(plan, input.config.perPlanner[p.name]),
      frozen.plan,
      env,
      identity.canonicalId,
      tagOf(host),
      displayFile,
    )
    if (SELF_CHECKS) {
      verifyPlan(plan, frozen.plan, input.code, identity)
    }
  }
  const { plan: emitPlan, edges } = frozen
  // ---- C: per-output edge policy (async) ----------------------------------------
  let inputMap: InputSourceMap | null | undefined
  const readInputMap = (): InputSourceMap | null => {
    if (inputMap === undefined) {
      inputMap =
        typeof input.inputMap === 'function'
          ? input.inputMap()
          : (input.inputMap ?? null)
    }
    return inputMap
  }
  for (const output of Object.keys(emitPlan.outputs) as Array<OutputId>) {
    const recipe = emitPlan.outputs[output]!
    const importerId = recipe.derivedId ?? identity.canonicalId
    for (const p of planners) {
      if (!p.policy) {
        continue
      }
      const ctx: PolicyContext = {
        identity,
        env,
        config: input.config.perPlanner[p.name],
        host,
        code: input.code,
        analysis: t0,
        inputMap: readInputMap,
        resolve: (spec, importer) => resolveFrom(spec, importer ?? importerId),
        targetFacts: targetFactsOf,
        targetMarker: targetMarkerOf,
        substitute: (edgeKey, specifier) => {
          // one record per logical edge, with every location of it
          const edge = edges[output]?.find((e) => e.edgeKey === edgeKey)
          if (edge) {
            substituteSpecifier(recipe, edge, specifier, input.code)
          }
        },
        diagnostic: (d) => emitPlan.diagnostics.push(d),
      }
      await p.policy(emitPlan, output, edges, ctx)
    }
  }
  return { kind: 'plan', plan: emitPlan }
}

/** J6-only tier: the env output is the source verbatim, with its edges when a policy reads them. */
function tier0Plan(
  t0: ModuleAnalysis,
  identity: SourceIdentity,
  env: EnvInfo,
  rev: string,
  withEdges: boolean,
): FrozenPlan {
  const code = t0.source.code
  const segments: EmitPlan['outputs'][string]['segments'] = [
    { k: 'slice', start: 0, end: code.length },
  ]
  const edgeKey = (raw: string, form: string) =>
    edgeKeyOf(env.name, identity.canonicalId, raw, form)
  const edges: PlanEdges = withEdges
    ? {
        env: dedupeEdges(
          sourceEdges(t0, edgeKey, identity.canonicalId, wholeModule()),
        ),
      }
    : {}
  return {
    plan: {
      revision: rev,
      outputs: {
        env: {
          kind: 'env',
          derivedId: null,
          mapSource: identity.path,
          segments,
          plainText: true,
        },
      },
      facts: { marker: t0.markers, planners: {} },
      dependencies: [],
      diagnostics: [],
    },
    edges,
  }
}

/** One planning round: every planner's `plan` on a fresh plan, in order, then placement. */
function planRound(
  t0: ModuleAnalysis,
  identity: SourceIdentity,
  env: EnvInfo,
  prefetched: ReadonlyMap<string, unknown>,
  fallbacks: ReadonlyArray<FallbackRecord>,
  planners: ReadonlyArray<Planner>,
  input: CompileInput,
  displayFile: string,
): AnalysisPlan {
  let serverText: ReadonlyArray<Range> | undefined
  const plan: AnalysisPlan = new AnalysisPlan(
    t0,
    identity,
    env,
    // each planner stored its own entry under its name (`PrefetchContext.set`)
    prefetched as PlannerPrefetches,
    fallbacks,
    displayFile,
    () =>
      (serverText ??= planners.flatMap(
        (p) =>
          p.serverText?.({
            ...withConfig(plan, input.config.perPlanner[p.name]),
            diagnostic: () => {},
            liveDiagnostic: () => {},
            serverText: () => {
              throw internalError(
                `The planner ${p.name} asked for the server-only text while giving its own`,
              )
            },
          }) ?? [],
      )),
  )
  for (const p of planners) {
    p.plan(withConfig(plan, input.config.perPlanner[p.name]))
  }
  plan.resolve()
  return plan
}

/** A planner's view of the plan with its own config. */
function withConfig(plan: AnalysisPlan, config: unknown): PlanContext {
  return {
    analysis: plan.analysis,
    t1: plan.t1,
    identity: plan.identity,
    displayPath: plan.displayPath,
    env: plan.env,
    config,
    rewrites: plan.rewrites,
    names: plan.names,
    symbols: plan.symbols,
    prefetched: plan.prefetched,
    fallbackAt: (range, kind) => plan.fallbackAt(range, kind),
    region: (range, kind) => plan.region(range, kind),
    replaceExpression: (r) => plan.replaceExpression(r),
    shapeOf: (node) => plan.shapeOf(node),
    declareOutput: (spec) => plan.declareOutput(spec),
    addRoot: (output, root) => plan.addRoot(output, root),
    setRouteModule: (route) => plan.setRouteModule(route),
    liveness: (output) => plan.liveness(output),
    nameOf: (sym) => plan.nameOf(sym),
    glueExportName: (sym) => plan.glueExportName(sym),
    tagGlueExports: (tag) => plan.tagGlueExports(tag),
    renameRefs: (sym, to, by, except) => plan.renameRefs(sym, to, by, except),
    setFacts: (planner, data) => plan.setFacts(planner, data),
    diagnostic: (d) => plan.diagnostic(d),
    liveDiagnostic: (d, when) => plan.liveDiagnostic(d, when),
    edgeKey: (raw, form, origin) => plan.edgeKey(raw, form, origin),
    serverText: () => plan.serverText(),
  }
}

/** The prefix of the core's own messages (`HostServices.tag`), with its space. */
function tagOf(host: HostServices): string {
  return host.tag === undefined ? '' : `${host.tag} `
}
