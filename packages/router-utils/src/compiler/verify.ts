/**
 * Semantic invariants of a plan, checked on its emitted outputs. A test-time
 * safety net (`TSR_COMPILER_VERIFY=1`, read once; every test run sets it):
 * each output is re-parsed and analysed like a module, so the checks see
 * what the bundler sees, not what placement believes. Unset, the only cost
 * is one boolean per compile. A violation throws: the compile fails loudly
 * instead of emitting a module that breaks at run time.
 */
import { isDeepStrictEqual } from 'node:util'
import { ModuleAnalysis, runsAtLoad } from './analysis'
import { emitRecipe } from './emit'
import { SourceText } from './output-builder'
import { parseModule } from './source'
import { hasRuntimeValue } from './symbols'
import type { SourceIdentity } from './identity'
import type { AnalysisPlan, EmitPlan, OutputRecipe } from './plan'
import type { OutputId } from './rewrite'
import type { SymbolId } from './symbols'
import type { OutputKind } from './reach'

export const VERIFY_OUTPUTS = process.env.TSR_COMPILER_VERIFY === '1'

/** An output that copies what it reaches (another layer's instance of the module), not one importing from the env module. */
const copies = (kind: OutputKind) => kind === 'provider'

const tailOf = (id: string) => id.slice(id.lastIndexOf('/') + 1)

/** The tail of a specifier naming a module of this directory (`./name?query`: how glue imports name the module's outputs), else null. */
const siblingTailOf = (specifier: string) =>
  specifier.startsWith('./') && !specifier.slice(2).split('?')[0]!.includes('/')
    ? specifier.slice(2)
    : null

export function verifyPlan(
  plan: AnalysisPlan,
  emitPlan: EmitPlan,
  code: string,
  identity: SourceIdentity,
): void {
  const source = new SourceText(code)
  const { t1 } = plan
  const envTree = plan.rewrites.tree('env')
  const problems: Array<string> = []
  const outputs = new Map<
    OutputId,
    { analysis: ModuleAnalysis; recipe: OutputRecipe }
  >()
  const outputByTail = new Map<string, OutputId>()
  for (const [key, recipe] of Object.entries(emitPlan.outputs)) {
    const id = key as OutputId
    outputByTail.set(tailOf(recipe.derivedId ?? identity.canonicalId), id)
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
      const tail = siblingTailOf(imp.specifier)
      if (tail === null) {
        continue
      }
      const target = outputByTail.get(tail)
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
          if (s.imported !== '*' && !names.has(s.imported)) {
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
        const atLoad = runsAtLoad(out)
        for (const s of imp.specifiers) {
          if (
            out.refs
              .refsOf(s.local)
              .some((r) => atLoad(r) && r.kind !== 'write')
          ) {
            problems.push(
              `${id}: reads ${s.localName} of the env module at its evaluation`,
            )
          }
        }
      }
    }
    // (c) an output holds nothing its own rewrite tree erases (a handler
    // body erased in every output of the client never reaches a chunk)
    const erased = plan.rewrites.tree(id).erasedParts()
    for (const seg of recipe.segments) {
      if (seg.k !== 'slice') {
        continue
      }
      for (const e of erased) {
        if (seg.start < e.end && seg.end > e.start) {
          problems.push(
            `${id}: holds text its output erases ([${e.start}, ${e.end}) in [${seg.start}, ${seg.end}))`,
          )
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
  // edits orphaned leaves with it): then nowhere. An output holds the unit
  // when a segment of it comes from the unit's range (a slice, or text
  // standing for a reference there), outside the sub-regions other outputs
  // claim (Hydrate children inside a statement render in their chunk).
  const placement = plan.placement
  const claimedRanges = [...plan.rewrites.claims.values()].map(
    (c) => t1.regions.get(c.region).range,
  )
  const inClaimed = (start: number, end: number) =>
    claimedRanges.some((r) => start >= r.start && end <= r.end)
  for (const u of t1.units) {
    if (u.kind !== 'effect' && u.kind !== 'import-effect') {
      continue
    }
    const { start, end } = t1.items[u.item]!.nodeRange
    if (envTree.isErasedAt(start)) {
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
