/**
 * `compileModule()` — phases A–D with the restart loop (DESIGN §2.6; R25,
 * R34). A: identify, validated cache lookup, parse (Tier 0), gates,
 * prefetch. B: synchronous planning and freeze. C: per-output edge policy,
 * snapshot validation, publication. D: emission on demand.
 */
import {
  deriveId,
  digestOf,
  identify,
  isCommonJsPath,
  revision,
} from './identity'
import { parseModule } from './source'
import { ModuleAnalysis } from './analysis'
import { AnalysisPlan } from './plan'
import { DependencyLedger, PlanCache, fingerprintCurrent } from './cache'
import { emitRecipe, substituteSpecifier } from './emit'
import { SourceText } from './output-builder'
import { ExportResolver } from './resolve'
import { fingerprintSourceFor, resolveCached } from './host'
import type { CacheEntry } from './cache'
import type { Emitted } from './emit'
import type { EmitPlan, EnvInfo, FallbackRecord, PlanContext } from './plan'
import type { PlanKey, SourceIdentity } from './identity'
import type { OutputId } from './rewrite'
import type { Diagnostic } from './diagnostics'
import type { RawSourceMap } from './output-builder'
import type {
  CompileInput,
  CompileOutput,
  CompilerCaches,
  HostServices,
  Planner,
  PolicyContext,
  PrefetchContext,
} from './host'

export const MAX_ATTEMPTS = 3

export function createCompilerCaches(
  rawFacts: HostServices['rawFacts'],
): CompilerCaches {
  return { plans: new Map(), rawFacts, resolutions: new Map() }
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
  const identity = identify(input.id)
  if (identity.lang === null) {
    return null
  }
  const env = input.env
  let cache = caches.plans.get(env.name)
  if (!cache) {
    cache = new PlanCache(env.name)
    caches.plans.set(env.name, cache)
  }
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
      let valid = true
      for (const fp of hit.plan.dependencies) {
        if (!(await fingerprintCurrent(fp, src))) {
          valid = false
          break
        }
      }
      if (valid && cache.lookup(key, rev) === hit) {
        return emitFrom(hit, requested, input)
      }
      cache.delete(key)
      cache.bump(key)
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
    const generation = cache.generation(key)
    const ledger = new DependencyLedger(key, generation, cache.dependents)
    const promise = runAttempt(
      input,
      identity,
      host,
      caches,
      cache,
      ledger,
      verdictMemo,
    )
    const record = { key, revision: rev, generation, promise, ledger }
    cache.inFlight.set(keyString, record)
    let result: AttemptResult
    try {
      result = await promise
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
    plan.fingerprint = digestOf({
      rev,
      configKey: input.config.configKey,
      deps: plan.dependencies,
    })
    const src = fingerprintSourceFor(
      caches,
      host,
      env.name,
      input.config.configKey,
    )
    const snapshotOk = await ledger.validateSnapshot(src)
    if (!snapshotOk || cache.generation(key) !== generation) {
      ledger.discard()
      if (cache.latestRevision(key) !== rev) {
        // superseded by a newer save: this text is stale; never publish, but answer this request
        const entry: CacheEntry = {
          key,
          revision: rev,
          generation,
          plan,
          emitted: new Map(),
        }
        return emitFrom(entry, requested, input)
      }
      continue
    }
    const entry: CacheEntry = {
      key,
      revision: rev,
      generation,
      plan,
      emitted: new Map(),
    }
    if (cache.set(entry)) {
      ledger.publish()
    } else {
      ledger.discard()
    }
    return emitFrom(entry, requested, input)
  }
  throw new Error(
    `dependencies of ${input.id} changed repeatedly during compilation (${MAX_ATTEMPTS} attempts)`,
  )
}

function emitFrom(
  entry: CacheEntry,
  requested: OutputId,
  input: CompileInput,
): CompileOutput {
  const plan = entry.plan
  const memoKey = `${requested}|${input.wantMap ? 'map' : 'code'}`
  let emitted = entry.emitted.get(memoKey)
  if (!emitted) {
    const recipe = plan.outputs[requested]
    if (!recipe) {
      emitted = { code: 'export {}\n', map: null }
    } else {
      emitted = emitRecipe(recipe, new SourceText(input.code), input.wantMap)
    }
    entry.emitted.set(memoKey, emitted)
  }
  const recipe = plan.outputs[requested]
  return {
    code: emitted.code,
    map: emitted.map,
    sideEffectFree: recipe ? plan.sideEffects[requested] === true : true,
    edges: plan.edges[requested] ?? [],
    facts: plan.facts,
    diagnostics: plan.diagnostics,
    dependencies: dependencyPaths(plan),
    fingerprint: plan.fingerprint,
    output: requested,
  }
}

function dependencyPaths(plan: EmitPlan): Array<string> {
  const out = new Set<string>()
  for (const fp of plan.dependencies) {
    if (fp.kind === 'summary' || fp.kind === 'target-facts') {
      out.add(identify(fp.canonicalId).path)
    } else if (fp.kind === 'route-registry') {
      out.add(fp.path)
    } else if (fp.kind === 'resolution' && fp.resolved !== null) {
      out.add(identify(fp.resolved).path)
    }
  }
  return [...out]
}

async function runAttempt(
  input: CompileInput,
  identity: SourceIdentity,
  host: HostServices,
  caches: CompilerCaches,
  cache: PlanCache,
  ledger: DependencyLedger,
  verdictMemo: Map<string, Promise<unknown>>,
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
  })
  const cjs = t0.sourceType !== 'module' || isCommonJsPath(identity.path)
  const gateCtx = (p: Planner) => ({
    identity,
    env,
    config: input.config.perPlanner[p.name],
  })
  let planners = input.planners.filter((p) => p.gate(t0, gateCtx(p)))
  if (cjs) {
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
    const resolved = await resolveCached(
      caches,
      host,
      env.name,
      importer,
      specifier,
    )
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
    const facts = await host.rawFacts.get(canonicalId)
    ledger.record({
      kind: 'target-facts',
      canonicalId,
      digest: facts.targetFacts.digest,
    })
    return facts.targetFacts
  }
  const resolver = new ExportResolver({
    summaryOf,
    resolveSpecifier: (spec, importer) => resolveFrom(spec, importer),
  })
  await Promise.all(
    planners.map((p) => {
      if (!p.prefetch) {
        return Promise.resolve()
      }
      const ctx: PrefetchContext = {
        identity,
        env,
        config: input.config.perPlanner[p.name],
        host,
        ledger,
        resolver,
        resolve: (spec) => resolveFrom(spec, identity.canonicalId),
        summary: summaryOf,
        targetFacts: targetFactsOf,
        set: (data) => prefetched.set(p.name, data),
      }
      return p.prefetch(t0, ctx)
    }),
  )

  // ---- B: planning (sync) ------------------------------------------------------
  const tier1Needed = planners.some((p) => p.tier === 1)
  let emitPlan: EmitPlan
  const rev = revision(input.code)
  if (!tier1Needed) {
    emitPlan = tier0Plan(t0, identity, env, key, rev)
  } else {
    let fallbacks: Array<FallbackRecord> = []
    let plan!: AnalysisPlan
    for (let round = 0; round < 3; round++) {
      plan = new AnalysisPlan(t0, identity, env, prefetched, fallbacks)
      for (const p of planners) {
        if (p.prepare) {
          p.prepare(withConfig(plan, input.config.perPlanner[p.name]))
        }
      }
      for (const p of planners) {
        p.plan(withConfig(plan, input.config.perPlanner[p.name]))
      }
      plan.resolve()
      const fresh = plan
        .fallbackRecords()
        .filter(
          (f) =>
            !fallbacks.some(
              (g) =>
                g.range.start === f.range.start &&
                g.range.end === f.range.end &&
                g.reason === f.reason,
            ),
        )
      if (fresh.length === 0 || round === 2) {
        break
      }
      fallbacks = [...fallbacks, ...fresh]
    }
    emitPlan = plan.freeze(key, rev)
  }
  // summary publication under the domain rule (no extra read: only when the raw revision is known and equal)
  const known = host.rawFacts.peekRevision(identity.canonicalId)
  if (known && !known.stale && known.revision === rev) {
    const published = host.rawFacts.publish(identity.canonicalId, rev, t0)
    emitPlan.facts.publishedSummaryDigest = published?.summary?.digest ?? null
  }

  // ---- C: per-output edge policy (async) ----------------------------------------
  let inputMap: RawSourceMap | null | undefined
  const readInputMap = (): RawSourceMap | null => {
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
    digestOf({
      env: env.name,
      layer: env.layer ?? null,
      importer: identity.canonicalId,
      rawSpecifier: raw,
      form,
    })
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
      names: [],
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
    region: (range, kind) => plan.region(range, kind),
    declareOutput: (spec) => plan.declareOutput(spec),
    outputIdFor: (derived) => plan.outputIdFor(derived),
    addRoot: (output, root) => plan.addRoot(output, root),
    markBenignEffect: (unit) => plan.markBenignEffect(unit),
    setRouteModule: () => plan.setRouteModule(),
    liveness: (output) => plan.liveness(output),
    renameRefs: (sym, to, scope, by) => plan.renameRefs(sym, to, scope, by),
    setFacts: (planner, data) => plan.setFacts(planner, data),
    diagnostic: (d) => plan.diagnostic(d),
    edgeKey: (raw, form, origin) => plan.edgeKey(raw, form, origin),
  }
}

export type { Emitted }
