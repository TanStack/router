/**
 * Semantic invariants of a plan, checked on its emitted outputs. A test-time
 * safety net (`TSR_COMPILER_VERIFY=1`, read once; every test run sets it):
 * each output is re-parsed and analysed like a module, so the checks see
 * what the bundler sees, not what placement believes. Unset, the only cost
 * is one boolean per compile. A violation throws: the compile fails loudly
 * instead of emitting a module that breaks at run time.
 */
import { ModuleAnalysis } from './analysis'
import { emitRecipe } from './emit'
import { SourceText } from './output-builder'
import { parseModule } from './source'
import type { SourceIdentity } from './identity'
import type { AnalysisPlan, EmitPlan, OutputRecipe } from './plan'
import type { OutputId } from './rewrite'
import type { OutputKind } from './reach'

export const VERIFY_OUTPUTS = process.env.TSR_COMPILER_VERIFY === '1'

/** An output that copies what it reaches (another layer's instance of the module), not one importing from the env module. */
const copies = (kind: OutputKind) => kind === 'provider' || kind === 'custom'

const tailOf = (id: string) => id.slice(id.lastIndexOf('/') + 1)

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
      if (!imp.specifier.startsWith('.')) {
        continue
      }
      const target = outputByTail.get(tailOf(imp.specifier))
      const home = target === undefined ? undefined : outputs.get(target)
      if (home === undefined) {
        continue
      }
      // (b) a glue import names an export of its home output
      if (!home.analysis.exports.some((e) => e.kind === 'star')) {
        const names = new Set(
          home.analysis.exports.flatMap((e) => ('name' in e ? [e.name] : [])),
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
      // evaluation (a TDZ through the re-export cycle)
      if (recipe.kind === 'export' && target === 'env') {
        for (const s of imp.specifiers) {
          if (
            out.refs.refsOf(s.local).some((r) => r.eager && r.kind !== 'write')
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
    const erased = plan.rewrites.tree(id).erasedParts(0, t1.tail.end)
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
  }
  // (d) every surviving effect unit is emitted exactly once across the
  // outputs that import from the env module (a copying output excepted),
  // unless placement removed its cluster (an augmentation of a binding our
  // edits orphaned leaves with it): then nowhere
  const placement = plan.placement
  for (const u of t1.units) {
    if (u.kind !== 'effect' && u.kind !== 'import-effect') {
      continue
    }
    const probe = t1.items[u.item]!.nodeRange.start
    if (envTree.isErasedAt(probe)) {
      continue
    }
    const cluster = placement?.clusterOfRegion.get(u.region)
    const expected =
      cluster !== undefined && placement?.home.get(cluster) === 'removed'
        ? 0
        : 1
    let n = 0
    for (const { recipe } of outputs.values()) {
      if (
        !copies(recipe.kind) &&
        recipe.segments.some(
          (s) => s.k === 'slice' && s.start <= probe && probe < s.end,
        )
      ) {
        n++
      }
    }
    if (n !== expected) {
      problems.push(
        `the effect at ${probe} is emitted ${n} times (expected ${expected})`,
      )
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `compiler invariants violated for ${identity.canonicalId}:\n${problems.join('\n')}`,
    )
  }
}
