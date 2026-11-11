/**
 * Semantic invariants of a plan, checked on its emitted outputs. A test-time
 * safety net (`SELF_CHECKS`, `self-checks.ts`; every test run sets it):
 * each output is re-parsed and analysed like a module, so the checks see
 * what the bundler sees, not what placement believes. Unset, the only cost
 * is one boolean per compile. A violation throws: the compile fails loudly
 * instead of emitting a module that breaks at run time.
 */
import { isDeepStrictEqual } from 'node:util'
import { ModuleAnalysis, visitRuns } from './analysis'
import { callsWhenEvaluated } from './units'
import { emitRecipe } from './emit'
import { SourceText } from './output-builder'
import { resolveSameFileSpecifier } from './identity'
import { parseModule } from './source'
import { hasRuntimeValue } from './symbols'
import type { ClassifiedRef, Tier1 } from './analysis'
import type { SourceIdentity } from './identity'
import type { AnalysisPlan, EmitPlan, OutputRecipe } from './plan'
import type { OutputId } from './rewrite'
import type { SymbolId } from './symbols'
import type { OutputKind } from './reach'
import type { UnitId } from './units'

/** An output that copies what it reaches (another layer's instance of the module), not one importing from the env module. */
const copies = (kind: OutputKind) => kind === 'provider'

export function verifyPlan(
  plan: AnalysisPlan,
  emitPlan: EmitPlan,
  code: string,
  identity: SourceIdentity,
): void {
  const source = new SourceText(code)
  const { t1 } = plan
  const envView = plan.rewrites.view('env')
  const problems: Array<string> = []
  const outputs = new Map<
    OutputId,
    { analysis: ModuleAnalysis; recipe: OutputRecipe }
  >()
  /** Each output by the id its glue imports name it by (`sameFileSpecifier`). */
  const outputById = new Map<string, OutputId>()
  for (const [key, recipe] of Object.entries(emitPlan.outputs)) {
    const id = key as OutputId
    outputById.set(recipe.derivedId ?? identity.canonicalId, id)
    const emitted = emitRecipe(recipe, source, false).code
    const parsed = parseModule(emitted, {
      lang: identity.lang!,
      path: identity.path,
    })
    if (!parsed.ok) {
      problems.push(
        `${id}: the output does not parse: ${parsed.diagnostics.map((d) => d.message).join('; ')}`,
      )
      continue
    }
    outputs.set(id, {
      analysis: new ModuleAnalysis(parsed.file, parsed.source, {
        path: identity.path,
      }),
      recipe,
    })
  }
  // the names of the source's module bindings no source read takes for a
  // global, and the names the planners generated
  const moduleNames = new Set<string>()
  for (let s = 0; s < t1.symbols.size; s++) {
    const sym = s as SymbolId
    const kind = t1.symbols.kind(sym)
    if (
      kind === 'generated' ||
      (kind === 'source' && t1.symbols.isModuleLevel(sym))
    ) {
      moduleNames.add(t1.symbols.name(sym))
    }
  }
  for (const f of t1.freeRefs) {
    moduleNames.delete(f.name)
  }
  /** What each extracted export's module imports of the others (check (h)). */
  const extractedImports = new Map<OutputId, Set<OutputId>>()
  for (const [id, { analysis, recipe }] of outputs) {
    const out = analysis.t1()
    // (a) no output assigns a binding it imports
    for (const ref of out.refs.all) {
      if (ref.kind === 'write' && out.symbols.isImport(ref.sym)) {
        problems.push(
          `${id}: assigns the imported binding ${out.symbols.name(ref.sym)}`,
        )
      }
    }
    for (const imp of analysis.imports) {
      // (the bundler erases a type-only import: it is no glue)
      if (imp.typeOnly) {
        continue
      }
      const named = resolveSameFileSpecifier(
        imp.specifier,
        identity.canonicalId,
      )
      if (named === null) {
        continue
      }
      const target = outputById.get(named)
      const home = target === undefined ? undefined : outputs.get(target)
      if (home === undefined) {
        continue
      }
      if (recipe.kind === 'export' && home.recipe.kind === 'export') {
        let set = extractedImports.get(id)
        if (!set) {
          extractedImports.set(id, (set = new Set()))
        }
        set.add(target!)
      }
      // (b) a glue import names an export of its home output that has a
      // runtime value (an `export { X }` of a type-only binding is erased
      // with it: the bundler sees no export)
      if (!home.analysis.exports.some((e) => e.kind === 'star')) {
        const homeSymbols = home.analysis.t1().symbols
        const names = new Set(
          home.analysis.exports.flatMap((e) => {
            if (!('name' in e) || ('typeOnly' in e && e.typeOnly)) {
              return []
            }
            if (e.kind === 'local' && e.local !== null) {
              const b = homeSymbols.binding(e.local)
              if (b !== null && !hasRuntimeValue(b)) {
                return []
              }
            }
            return [e.name]
          }),
        )
        for (const s of imp.specifiers) {
          if (!s.typeOnly && s.imported !== '*' && !names.has(s.imported)) {
            problems.push(
              `${id}: imports ${s.imported} from ${target}, which does not export it`,
            )
          }
        }
      }
      // (e) an extracted export's module (evaluated before the env
      // module's body) never reads a binding of the env module at its
      // evaluation (a TDZ through the re-export cycle), in its own text or
      // in a function it calls then
      if (recipe.kind === 'export' && target === 'env') {
        const atLoad = loadRuns(out)
        for (const s of imp.specifiers) {
          if (
            out.refs
              .refsOf(s.local)
              .some((r) => atLoad.has(r) && r.kind !== 'write')
          ) {
            problems.push(
              `${id}: reads ${s.localName} of the env module at its evaluation`,
            )
          }
        }
      }
    }
    // (g) no output reads a module binding of the source, or a generated
    // binding, it neither declares nor imports (the read would fall through
    // to a global)
    const unbound = new Set(
      out.freeRefs.filter((f) => moduleNames.has(f.name)).map((f) => f.name),
    )
    for (const name of unbound) {
      problems.push(
        `${id}: reads ${name}, which it neither declares nor imports`,
      )
    }
  }
  // (h) no two extracted modules import each other: which evaluates first
  // would depend on the bundler, and a read at evaluation can crash
  for (const start of extractedImports.keys()) {
    const seen = new Set<OutputId>()
    const work = [...extractedImports.get(start)!]
    while (work.length > 0) {
      const o = work.pop()!
      if (o === start) {
        problems.push(`${start}: is in an import cycle of extracted modules`)
        break
      }
      if (!seen.has(o)) {
        seen.add(o)
        work.push(...(extractedImports.get(o) ?? []))
      }
    }
  }
  // (d) every surviving effect unit is emitted exactly once across the
  // outputs that import from the env module (a copying output excepted),
  // unless placement removed its cluster (an augmentation of a binding our
  // edits orphaned leaves with it): then nowhere. An output holds the unit
  // when a segment of it comes from the unit's range (a slice, or text
  // standing for a reference there), outside the sub-regions other outputs
  // claim (Hydrate children inside a statement render in their chunk).
  const placement = plan.placement
  const claimedRanges = [...plan.rewrites.claims.values()].map(
    (c) => plan.regions.get(c.region).range,
  )
  const inClaimed = (start: number, end: number) =>
    claimedRanges.some((r) => start >= r.start && end <= r.end)
  for (const u of t1.units) {
    if (u.kind !== 'effect' && u.kind !== 'import-effect') {
      continue
    }
    const { start, end } = t1.items[u.item]!.nodeRange
    if (envView.isErasedAt(start)) {
      continue
    }
    const cluster = placement?.clusterOfRegion.get(u.region)
    const expected =
      cluster !== undefined && placement?.home.get(cluster) === 'removed'
        ? 0
        : 1
    let n = 0
    for (const { recipe } of outputs.values()) {
      if (copies(recipe.kind)) {
        continue
      }
      const holds = recipe.segments.some((s) =>
        s.k === 'slice'
          ? s.start < end && s.end > start && !inClaimed(s.start, s.end)
          : s.mapTo !== undefined &&
            s.mapTo >= start &&
            s.mapTo < end &&
            !inClaimed(s.mapTo, s.mapTo + 1),
      )
      if (holds) {
        n++
      }
    }
    if (n !== expected) {
      problems.push(
        `the effect at ${start} is emitted ${n} times (expected ${expected})`,
      )
    }
  }
  // (f) planner facts are JSON data: a cached plan retains them as they are
  // (no Yuku node, no class instance, no `undefined` member)
  const facts = emitPlan.facts.planners
  if (!isDeepStrictEqual(facts, JSON.parse(JSON.stringify(facts)))) {
    problems.push('the planner facts are not JSON data')
  }
  if (problems.length > 0) {
    throw new Error(
      `compiler invariants violated for ${identity.canonicalId}:\n${problems.join('\n')}`,
    )
  }
}

/** The references a module's evaluation runs: what each of its units runs when it evaluates (`visitRuns`). */
function loadRuns(out: Tier1): Set<ClassifiedRef> {
  const runs = new Set<ClassifiedRef>()
  const textOf = (u: UnitId) => out.refs.refsIn(out.units[u]!.range)
  for (const unit of out.units) {
    const calls = callsWhenEvaluated(unit.node)
    visitRuns(
      out,
      textOf(unit.id),
      calls.calls.length > 0 ? calls : null,
      textOf,
      (ref) => {
        runs.add(ref)
        return false
      },
    )
  }
  return runs
}
