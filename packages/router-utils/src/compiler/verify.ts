/**
 * Semantic invariants of a plan, checked on its emitted outputs. A test-time
 * safety net (`SELF_CHECKS`, `self-checks.ts`; every test run sets it):
 * each output is re-parsed and analysed like a module, so the checks see
 * what the bundler sees, not what placement believes. Unset, the only cost
 * is one boolean per compile. A violation throws: the compile fails loudly
 * instead of emitting a module that breaks at run time.
 */
import { isDeepStrictEqual } from 'node:util'
import { ModuleAnalysis } from './analysis'
import { emitRecipe } from './emit'
import { SourceText } from './output-builder'
import { resolveSameFileSpecifier } from './identity'
import { parseModule } from './source'
import { hasRuntimeValue } from './symbols'
import type { SourceIdentity } from './identity'
import type { AnalysisPlan, EmitPlan, OutputRecipe } from './plan'
import type { OutputId } from './rewrite'
import type { SymbolId } from './symbols'
import type { OutputKind } from './reach'

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
  for (const [id, { analysis }] of outputs) {
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
  // (d) every surviving effect unit is emitted exactly once across the
  // outputs that import from the env module (a copying output excepted),
  // unless placement removed its cluster (an augmentation of a binding our
  // edits orphaned leaves with it): then nowhere; or homed it in a copying
  // output (a write to state only the provider's handlers read, recheck
  // ruling E): then in that output alone. An output holds the unit
  // when a segment of it comes from the unit's range (a slice, or text
  // standing for a reference there), outside the sub-regions other outputs
  // claim (Hydrate children inside a statement render in their chunk); of a
  // claim of the statement's whole text (a bare server-fn statement the
  // provider hoists, R162), the output holding its placeholder holds the
  // statement.
  const placement = plan.placement
  const claimedRanges = [...plan.rewrites.claims.values()].map(
    (c) => plan.regions.get(c.region).range,
  )
  for (const u of t1.units) {
    if (u.kind !== 'effect' && u.kind !== 'import-effect') {
      continue
    }
    const { start, end } = t1.items[u.item]!.nodeRange
    if (envView.isErasedAt(start)) {
      continue
    }
    const cluster = placement?.clusterOfRegion.get(u.region)
    const home =
      cluster === undefined ? undefined : placement?.home.get(cluster)
    const copy = home === undefined ? undefined : outputs.get(home as OutputId)
    const inCopy = copy !== undefined && copies(copy.recipe.kind)
    // (a route file's split chunk copying a statement holds it too, as on `main`)
    const chunkCopies =
      cluster === undefined
        ? 0
        : [...outputs].filter(
            ([o, { recipe }]) =>
              o !== home &&
              !copies(recipe.kind) &&
              placement!.included.get(o)?.has(cluster) === true,
          ).length
    const expected = home === 'removed' || inCopy ? 0 : 1 + chunkCopies
    // (a claim of the statement's whole text: its placeholder stands for it)
    const whole = claimedRanges.find((r) => r.start <= start && r.end >= end)
    const inClaimed = (a: number, b: number) =>
      claimedRanges.some((r) => a >= r.start && b <= r.end)
    const holds = (recipe: OutputRecipe) =>
      recipe.segments.some((s) =>
        s.k === 'slice'
          ? s.start < end && s.end > start && !inClaimed(s.start, s.end)
          : s.mapTo !== undefined &&
            s.mapTo >= start &&
            s.mapTo < end &&
            (!inClaimed(s.mapTo, s.mapTo + 1) || s.mapTo === whole?.start),
      )
    let n = 0
    for (const { recipe } of outputs.values()) {
      if (!copies(recipe.kind) && holds(recipe)) {
        n++
      }
    }
    if (n !== expected) {
      problems.push(
        `the effect at ${start} is emitted ${n} times (expected ${expected})`,
      )
    }
    if (inCopy && !holds(copy.recipe)) {
      problems.push(`${home}: does not emit the effect at ${start} it holds`)
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
