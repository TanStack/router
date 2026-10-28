/**
 * `compileModule()` — phases A–D with the restart loop (README.md,
 * "Pipeline"). A: identify, validated cache lookup, parse (Tier 0), gates,
 * prefetch. B: synchronous planning and freeze. C: per-output edge policy,
 * snapshot validation, publication. D: emission on demand.
 */
import {
  deriveId,
  digestOf,
  edgeKeyOf,
  identify,
  isCommonJsPath,
  revision,
} from './identity'
import { parseModule } from './source'
import { ModuleAnalysis } from './analysis'
import { AnalysisPlan } from './plan'
import { DependencyLedger, fingerprintCurrent } from './cache'
import { emitRecipe, substituteSpecifier } from './emit'
import { SourceText } from './output-builder'
import { ExportResolver } from './resolve'
import { fingerprintSourceFor, planCacheFor, resolveForAnalysis } from './host'
import { registerCompilerStats } from './stats'
import { VERIFY_OUTPUTS, verifyPlan } from './verify'
import type { CacheEntry, PlanCache } from './cache'
import type {
  EmitPlan,
  EnvInfo,
  FallbackRecord,
  OutputRecipe,
  PlanContext,
} from './plan'
import type { PlanKey, SourceIdentity } from './identity'
import type { OutputId } from './rewrite'
import type { Diagnostic } from './diagnostics'
import type {
  CompileInput,
  CompileOutput,
  CompilerCaches,
  HostServices,
  InputSourceMap,
  Planner,
  PolicyContext,
  PrefetchContext,
} from './host'

export const MAX_ATTEMPTS = 3

/** An attempt whose snapshot moved: compile again. */

/** The caches of one compiler session; `label` names them in `compilerStats()`. */
export function createCompilerCaches(
  rawFacts: HostServices['rawFacts'],
  label = 'compiler',
): CompilerCaches {
  const caches: CompilerCaches = {
    plans: new Map(),
    rawFacts,
    fileSetVersion: 0,
  }
  registerCompilerStats(label, caches, (c) => {
    const withBytes = process.env.TSR_COMPILER_STATS_BYTES !== '0'
    const out: Record<string, number> = c.rawFacts.stats(withBytes)
    const add = (counts: Record<string, number>) => {
      for (const [k, v] of Object.entries(counts)) {
        out[k] = (out[k] ?? 0) + v
      }
    }
    for (const plans of c.plans.values()) {
      add(plans.stats(withBytes))
    }
    return out
  })
  return caches
}

type AttemptResult =
  | { kind: 'untouched' }
  | { kind: 'parse-error'; diagnostics: Array<Diagnostic> }
  | { kind: 'plan'; plan: EmitPlan }

/**
 * Compiles one host id. Returns null when untouched (every gate failed,
 * non-ESM, non-JS id). For a derived id whose plan has no such output the
 * code is `export {}\n`.
 */
export async function compileModule(
  input: CompileInput,
  host: HostServices,
  caches: CompilerCaches,
): Promise<CompileOutput | null> {
  const own = identify(input.id)
  // a non-JS id whose code reaches us as JS (`.vue`, `.mdx`) compiles with Tier 0 only
  const tier0Only = own.lang === null
  const identity = tier0Only && input.lang ? { ...own, lang: input.lang } : own
  if (identity.lang === null) {
    return null
  }
  const env = input.env
  const cache = planCacheFor(caches, env.name)
  const key: PlanKey = {
    env: env.name,
    canonicalId: identity.canonicalId,
    configKey: input.config.configKey,
  }
  const rev = revision(input.code)
  const requested: OutputId = identity.derived
    ? `derived:${deriveId(identity.canonicalId, identity.derived)}`
    : 'env'
  const verdictMemo = new Map<string, Promise<unknown>>()
  const keyString = `${key.env}\u0000${key.canonicalId}\u0000${key.configKey}`
  // the plan of the last overtaken attempt: served (unpublished) when every attempt was overtaken
  let overtaken: CacheEntry | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    cache.noteRevision(key, rev)
    const hit = cache.lookup(key, rev)
    if (hit) {
      const src = fingerprintSourceFor(
        caches,
        host,
        env.name,
        input.config.configKey,
      )
      // resolutions validated at the current file-set version stand (not re-asked)
      const fileSetVersion = caches.fileSetVersion
      const resolutionsCurrent = hit.resolvedAt === fileSetVersion
      // every fingerprint at once: the checks are independent reads
      const checks: Array<Promise<boolean>> = []
      for (const fp of hit.plan.dependencies) {
        if (resolutionsCurrent && fp.kind === 'resolution') {
          continue
        }
        checks.push(fingerprintCurrent(fp, src))
      }
      const valid = (await Promise.all(checks)).every((ok) => ok)
      if (valid && cache.lookup(key, rev) === hit) {
        hit.resolvedAt = fileSetVersion
        cache.counters.planHits++
        return emitFrom(hit, requested, input, caches)
      }
      cache.delete(key)
      cache.bump(key)
      overtaken = hit
      continue
    }
    const inflight = cache.inFlight.get(keyString)
    if (inflight && inflight.revision === rev) {
      try {
        await inflight.promise
      } catch {
        // the owner reports; we retry below
      }
      continue
    }
    // the key's generation and latest revision stay meaningful until the attempt ends
    cache.begin(key)
    let outcome: CompileOutput | null | { retry: CacheEntry }
    try {
      outcome = await (async (): Promise<
        CompileOutput | null | { retry: CacheEntry }
      > => {
        const generation = cache.generation(key)
        const fileSetVersion = caches.fileSetVersion
        const ledger = new DependencyLedger(key, generation, cache.dependents)
        const promise = runAttempt(
          input,
          identity,
          tier0Only,
          host,
          caches,
          cache,
          ledger,
          verdictMemo,
          rev,
        )
        const record = { key, revision: rev, generation, promise, ledger }
        cache.inFlight.set(keyString, record)
        let result: AttemptResult
        try {
          result = await promise
        } catch (error) {
          // a throwing attempt (a planner error) leaves no in-flight dependents rows behind
          ledger.discard()
          throw error
        } finally {
          if (cache.inFlight.get(keyString) === record) {
            cache.inFlight.delete(keyString)
          }
        }
        if (result.kind === 'untouched') {
          ledger.discard()
          return null
        }
        if (result.kind === 'parse-error') {
          ledger.discard()
          return {
            code: input.code,
            map: null,
            sideEffectFree: false,
            edges: [],
            facts: { marker: null, publishedSummaryDigest: null, planners: {} },
            diagnostics: result.diagnostics,
            dependencies: [],
            fingerprint: '',
            output: requested,
          }
        }
        const plan = result.plan
        plan.dependencies = [...ledger.entries]
        const src = fingerprintSourceFor(
          caches,
          host,
          env.name,
          input.config.configKey,
        )
        const snapshotOk = await ledger.validateSnapshot(
          src,
          caches.fileSetVersion === fileSetVersion,
        )
        if (!snapshotOk || cache.generation(key) !== generation) {
          ledger.discard()
          const entry: CacheEntry = {
            key,
            revision: rev,
            generation,
            plan,
            resolvedAt: fileSetVersion,
          }
          if (cache.latestRevision(key) !== rev) {
            // superseded by a newer save: this text is stale; never publish, but answer this request
            return emitFrom(entry, requested, input, caches)
          }
          return { retry: entry }
        }
        const entry: CacheEntry = {
          key,
          revision: rev,
          generation,
          plan,
          resolvedAt: fileSetVersion,
        }
        if (cache.set(entry)) {
          ledger.publish()
        } else {
          ledger.discard()
        }
        return emitFrom(entry, requested, input, caches)
      })()
    } finally {
      cache.end(key)
    }
    if (outcome === null || !('retry' in outcome)) {
      return outcome
    }
    overtaken = outcome.retry
  }
  // Every attempt was overtaken (a save storm, a checkout touching several
  // dependencies): the last plan answers this request without being
  // published, so the next request compiles afresh; the host sees a warning
  // instead of a transform error for a transient condition.
  if (overtaken === null) {
    throw new Error(
      `dependencies of ${input.id} changed repeatedly during compilation (${MAX_ATTEMPTS} attempts)`,
    )
  }
  const served = emitFrom(overtaken, requested, input, caches)
  return {
    ...served,
    diagnostics: [
      ...served.diagnostics,
      {
        severity: 'warning',
        code: 'compile-overtaken',
        by: 'core',
        message: `dependencies of ${input.id} changed repeatedly during compilation (${MAX_ATTEMPTS} attempts); served from the last attempt and not cached`,
      },
    ],
  }
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
      : emitRecipe(recipe, new SourceText(input.code), input.wantMap)
    : { code: 'export {}\n', map: null }
  return {
    code: emitted.code,
    map: emitted.map,
    sideEffectFree: recipe ? plan.sideEffects[requested] === true : true,
    edges: plan.edges[requested] ?? [],
    facts: plan.facts,
    diagnostics: plan.diagnostics,
    dependencies: dependencyPaths(plan, caches),
    // only the Rsbuild session reads it, once per compile: computed on demand
    get fingerprint() {
      return planFingerprint(entry)
    },
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

/** The plan's fingerprint (its text, configuration and dependencies), computed on first use. */
function planFingerprint(entry: CacheEntry): string {
  const plan = entry.plan
  if (plan.fingerprint === '') {
    plan.fingerprint = digestOf({
      rev: entry.revision,
      configKey: entry.key.configKey,
      deps: plan.dependencies,
    })
  }
  return plan.fingerprint
}

/** The files a plan read (a known package is recognised by its specifier, never read). */
function dependencyPaths(
  plan: EmitPlan,
  caches: CompilerCaches,
): Array<string> {
  const out = new Set<string>()
  const addModule = (canonicalId: string) => {
    if (!caches.rawFacts.isKnownSpecifier(canonicalId)) {
      out.add(identify(canonicalId).path)
    }
  }
  for (const fp of plan.dependencies) {
    if (
      fp.kind === 'summary' ||
      fp.kind === 'target-facts' ||
      fp.kind === 'target-marker'
    ) {
      addModule(fp.canonicalId)
    } else if (fp.kind === 'route-registry') {
      out.add(fp.path)
    } else if (fp.kind === 'resolution' && fp.resolved !== null) {
      addModule(fp.resolved)
    }
  }
  return [...out]
}

async function runAttempt(
  input: CompileInput,
  identity: SourceIdentity,
  tier0Only: boolean,
  host: HostServices,
  caches: CompilerCaches,
  cache: PlanCache,
  ledger: DependencyLedger,
  verdictMemo: Map<string, Promise<unknown>>,
  rev: string,
): Promise<AttemptResult> {
  const env = input.env
  const key = ledger.key
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
  })
  const cjs = t0.sourceType !== 'module' || isCommonJsPath(identity.path)
  const gateCtx = (p: Planner) => ({
    identity,
    env,
    config: input.config.perPlanner[p.name],
  })
  let planners = input.planners.filter((p) => p.gate(t0, gateCtx(p)))
  if (cjs || tier0Only) {
    planners = planners.filter((p) => p.tier === 0)
  }
  if (planners.length === 0) {
    return { kind: 'untouched' }
  }
  ledger.record({ kind: 'config', configKey: input.config.configKey })

  // ---- A: prefetch -----------------------------------------------------------
  const prefetched = new Map<string, unknown>()
  const resolveFrom = async (
    specifier: string,
    importer: string,
  ): Promise<string | null> => {
    // one answer per attempt: the ledger's recorded resolution is reused
    const known = ledger.resolved(env.name, importer, specifier)
    if (known !== undefined) {
      return known
    }
    const resolved = await resolveForAnalysis(
      caches,
      host,
      env.name,
      importer,
      specifier,
    )
    if (env.mode === 'dev') {
      // a dev server's pending requests get in between the resolutions of
      // one update, as they did while every resolution was resolver I/O: an
      // analysis answered from the memo in microtasks alone makes a server
      // function call during an edit wait for the whole update (+3 ms)
      await new Promise((turn) => setImmediate(turn))
    }
    ledger.record({
      kind: 'resolution',
      env: env.name,
      importer,
      specifier,
      resolved,
    })
    return resolved
  }
  const summaryOf = async (canonicalId: string) => {
    const facts = await host.rawFacts.get(canonicalId)
    ledger.record({
      kind: 'summary',
      canonicalId,
      digest: facts.summary?.digest ?? null,
    })
    return facts.summary
  }
  const targetFactsOf = async (canonicalId: string) => {
    const facts = await host.rawFacts.getTarget(canonicalId)
    ledger.record({
      kind: 'target-facts',
      canonicalId,
      digest: facts.targetFacts.digest,
    })
    return facts.targetFacts
  }
  const targetMarkerOf = async (canonicalId: string) => {
    const { marker } = (await host.rawFacts.getTarget(canonicalId)).targetFacts
    ledger.record({ kind: 'target-marker', canonicalId, marker })
    return marker
  }
  const resolver = new ExportResolver({
    summaryOf,
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
        env,
        config: input.config.perPlanner[p.name],
        host,
        ledger,
        resolver,
        resolve: (spec) => resolveFrom(spec, identity.canonicalId),
        resolveFrom,
        summary: summaryOf,
        targetFacts: targetFactsOf,
        targetMarker: targetMarkerOf,
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
  let emitPlan: EmitPlan
  if (!tier1Needed) {
    emitPlan = tier0Plan(t0, identity, env, key, rev)
  } else {
    // Planning rounds: the core reports the regions a split would break
    // (a chunk writing a binding the route module reads, a relocated read
    // of mutated state, …) and the planners re-plan with them kept in
    // place. A kept region can free the next one (a chain of writers), so
    // the rounds continue until no new region is reported; each round keeps
    // at least one more region of the module, so they end within the
    // number of regions. Past that bound (a planner registering new regions
    // every round) the module is planned with every sub-region kept in
    // place, which is always correct, and a warning says so.
    let fallbacks: Array<FallbackRecord> = []
    let plan!: AnalysisPlan
    for (let round = 0; ; round++) {
      plan = planRound(
        t0,
        identity,
        env,
        prefetched,
        fallbacks,
        planners,
        input,
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
      if (fresh.length === 0) {
        break
      }
      if (round >= plan.t1.regions.regions.length) {
        fallbacks = plan.t1.regions.regions
          .filter((r) => r.kind !== 'unit')
          .map((r) => ({ range: r.range, kind: r.kind, reason: 'exhausted' }))
        plan = planRound(
          t0,
          identity,
          env,
          prefetched,
          fallbacks,
          planners,
          input,
        )
        plan.diagnostic({
          severity: 'warning',
          message:
            'The compiler could not settle which parts of this module can be split: nothing of it is split.',
          range: fresh[0]!.range,
          by: 'core',
          code: 'fallback-rounds-exhausted',
        })
        break
      }
      fallbacks = [...fallbacks, ...fresh]
    }
    emitPlan = plan.freeze(key, rev)
    if (VERIFY_OUTPUTS) {
      verifyPlan(plan, emitPlan, input.code, identity)
    }
  }
  // summary publication under the domain rule (no extra read: only when the raw revision is known and equal)
  const known = host.rawFacts.peekRevision(identity.canonicalId)
  if (known && !known.stale && known.revision === rev) {
    const published = host.rawFacts.publish(identity.canonicalId, rev, t0)
    emitPlan.facts.publishedSummaryDigest = published?.summary?.digest ?? null
  }

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
        inputMap: readInputMap,
        ledger,
        resolve: (spec, importer) => resolveFrom(spec, importer ?? importerId),
        targetFacts: targetFactsOf,
        targetMarker: targetMarkerOf,
        substitute: (edgeKey, specifier) => {
          substituteSpecifier(recipe, edgeKey, specifier, input.code)
        },
        memo: <T>(k: string, compute: () => Promise<T>): Promise<T> => {
          let p0 = verdictMemo.get(k) as Promise<T> | undefined
          if (!p0) {
            p0 = compute()
            verdictMemo.set(k, p0)
          }
          return p0
        },
        diagnostic: (d) => emitPlan.diagnostics.push(d),
      }
      await p.policy(emitPlan, output, emitPlan.edges[output] ?? [], ctx)
    }
  }
  void cache
  return { kind: 'plan', plan: emitPlan }
}

/** J6-only tier: the env output is the source verbatim with its edges. */
function tier0Plan(
  t0: ModuleAnalysis,
  identity: SourceIdentity,
  env: EnvInfo,
  key: PlanKey,
  rev: string,
): EmitPlan {
  const code = t0.source.code
  const edges: EmitPlan['edges'] = { env: [] }
  const segments: EmitPlan['outputs'][string]['segments'] = [
    { k: 'slice', start: 0, end: code.length },
  ]
  const edgeKey = (raw: string, form: string) =>
    edgeKeyOf(env.name, env.layer, identity.canonicalId, raw, form)
  const mark = (range: { start: number; end: number }, k: string) => {
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]!
      if (
        s.k === 'slice' &&
        s.start <= range.start &&
        s.end >= range.end &&
        s.edgeKey === undefined
      ) {
        const parts: typeof segments = []
        if (s.start < range.start) {
          parts.push({ k: 'slice', start: s.start, end: range.start })
        }
        parts.push({
          k: 'slice',
          start: range.start,
          end: range.end,
          edgeKey: k,
        })
        if (range.end < s.end) {
          parts.push({ k: 'slice', start: range.end, end: s.end })
        }
        segments.splice(i, 1, ...parts)
        return
      }
    }
  }
  for (const imp of t0.imports) {
    if (imp.typeOnly) {
      continue
    }
    const form = imp.bare ? 'bare' : 'static'
    const k = edgeKey(imp.specifier, form)
    mark(imp.specifierRange, k)
    // binding edge iff a specifier is used as a value (an import whose
    // bindings are unused, or only used as types, is an evaluation edge)
    const names = t0.importEdgeNames(imp)
    edges.env!.push({
      output: 'env',
      importerId: identity.canonicalId,
      edgeKey: k,
      form,
      kind: names.length > 0 ? 'binding' : 'evaluation',
      specifier: imp.specifier,
      locations: [{ range: imp.specifierRange }],
      typeOnly: false,
      names,
      provenance: { origin: 'source' },
    })
  }
  for (const re of t0.reexports) {
    if (re.typeOnly) {
      continue
    }
    const form = re.kind === 'star' ? 'star' : 'reexport'
    const k = edgeKey(re.specifier, form)
    mark(re.specifierRange, k)
    edges.env!.push({
      output: 'env',
      importerId: identity.canonicalId,
      edgeKey: k,
      form,
      kind: 'evaluation',
      specifier: re.specifier,
      locations: [{ range: re.specifierRange }],
      typeOnly: false,
      names: re.names,
      provenance: { origin: 'source' },
    })
  }
  for (const dyn of t0.dynamicEdges) {
    const k = edgeKey(dyn.specifier, dyn.form)
    mark(dyn.specifierRange, k)
    edges.env!.push({
      output: 'env',
      importerId: identity.canonicalId,
      edgeKey: k,
      form: dyn.form,
      kind: 'evaluation',
      specifier: dyn.specifier,
      locations: [{ range: dyn.specifierRange }],
      typeOnly: false,
      names: dyn.names,
      provenance: { origin: 'source' },
    })
  }
  return {
    key,
    revision: rev,
    sourceLength: code.length,
    outputs: {
      env: {
        id: 'env',
        kind: 'env',
        derivedId: null,
        mapSource: identity.path,
        segments,
      },
    },
    edges,
    facts: { marker: t0.markers, publishedSummaryDigest: null, planners: {} },
    dependencies: [],
    fingerprint: '',
    diagnostics: [],
    sideEffects: { env: false },
    fallbacks: [],
  }
}

/** One planning round: every planner's `prepare` and `plan` on a fresh plan, then placement. */
function planRound(
  t0: ModuleAnalysis,
  identity: SourceIdentity,
  env: EnvInfo,
  prefetched: ReadonlyMap<string, unknown>,
  fallbacks: ReadonlyArray<FallbackRecord>,
  planners: ReadonlyArray<Planner>,
  input: CompileInput,
): AnalysisPlan {
  const plan = new AnalysisPlan(t0, identity, env, prefetched, fallbacks)
  for (const p of planners) {
    if (p.prepare) {
      p.prepare(withConfig(plan, input.config.perPlanner[p.name]))
    }
  }
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
    env: plan.env,
    config,
    rewrites: plan.rewrites,
    names: plan.names,
    symbols: plan.symbols,
    prefetched: plan.prefetched,
    fallbacks: plan.fallbacks,
    fallbackAt: (range, kind) => plan.fallbackAt(range, kind),
    region: (range, kind) => plan.region(range, kind),
    declareOutput: (spec) => plan.declareOutput(spec),
    outputIdFor: (derived) => plan.outputIdFor(derived),
    addRoot: (output, root) => plan.addRoot(output, root),
    markBenignEffect: (unit) => plan.markBenignEffect(unit),
    extract: (sym, output) => plan.extract(sym, output),
    keep: (sym) => plan.keep(sym),
    setRouteModule: () => plan.setRouteModule(),
    liveness: (output) => plan.liveness(output),
    renameRefs: (sym, to, scope, by, except) =>
      plan.renameRefs(sym, to, scope, by, except),
    setFacts: (planner, data) => plan.setFacts(planner, data),
    diagnostic: (d) => plan.diagnostic(d),
    edgeKey: (raw, form, origin) => plan.edgeKey(raw, form, origin),
  }
}
