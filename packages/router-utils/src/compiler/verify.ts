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
import { Declarations } from './declarations'
import { emitRecipe } from './emit'
import { SourceText } from './output-builder'
import { resolveSameFileSpecifier } from './identity'
import { forEachChild, parseModule, patternIdentifiers } from './source'
import { internalError } from './self-checks'
import type { Node } from 'yuku'
import type { SourceIdentity } from './identity'
import type { AnalysisPlan, EmitPlan, OutputRecipe } from './plan'
import type { OutputId } from './rewrite'
import type { SymbolId } from './symbols'
import type { OutputKind } from './placement'

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
      // runtime value (a type-only export, `export { X }` of a type-only
      // binding included, is erased: the bundler sees no export)
      if (!home.analysis.exports.some((e) => e.kind === 'star')) {
        const names = new Set(
          home.analysis.exports.flatMap((e) =>
            !('name' in e) || ('typeOnly' in e && e.typeOnly) ? [] : [e.name],
          ),
        )
        for (const s of imp.specifiers) {
          if (!s.typeOnly && !s.namespace && !names.has(s.imported)) {
            problems.push(
              `${id}: imports ${s.imported} from ${target}, which does not export it`,
            )
          }
        }
      }
    }
    // (g) no output reads a module binding of the source, or a generated
    // binding, it neither declares nor imports (the read would fall through
    // to a global). An ambient declaration's text is erased: the heritage of
    // a `declare class` reads nothing
    const free = out.freeRefs.filter((f) => moduleNames.has(f.name))
    const table = free.length > 0 ? new Declarations(analysis.file) : null
    const unbound = new Set(
      free.filter((f) => !table!.ambientAt(f.range.start)).map((f) => f.name),
    )
    for (const name of unbound) {
      problems.push(
        `${id}: reads ${name}, which it neither declares nor imports`,
      )
    }
  }
  // (d) every surviving effect unit is emitted exactly once across the
  // outputs that import from the env module (a copying output excepted), and
  // once more by each chunk that copies it, unless placement removed its
  // cluster: then nowhere. An output holds the unit when a segment of it
  // comes from the unit's range (a slice, or text standing for source there;
  // a generated unit's own text, `gen`, stands for none), outside the
  // sub-regions other outputs claim (Hydrate children inside a statement
  // render in their chunk); of a
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
    const expected = home === 'removed' ? 0 : 1 + chunkCopies
    // (a claim of the statement's whole text: its placeholder stands for it)
    const whole = claimedRanges.find((r) => r.start <= start && r.end >= end)
    const inClaimed = (a: number, b: number) =>
      claimedRanges.some((r) => a >= r.start && b <= r.end)
    const holds = (recipe: OutputRecipe) =>
      recipe.segments.some((s) =>
        s.k === 'slice'
          ? s.start < end && s.end > start && !inClaimed(s.start, s.end)
          : s.mapTo !== undefined &&
            s.gen !== true &&
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
  }
  // (h) a declarator erasure orphans goes with its initialiser (SPEC G16):
  // no output holds more declarators binding nothing (`var {} = f()`) than
  // the source, and the env module declares no `var` of a nested statement
  // (its declarator is no unit placement decides) all of whose readers it
  // erased with every other binding of its declarator
  const emptyInSource = emptyDeclarators(plan.analysis.file.program)
  for (const [id, { analysis }] of outputs) {
    if (emptyDeclarators(analysis.file.program) > emptyInSource) {
      problems.push(
        `${id}: keeps the initialiser of a declarator binding nothing`,
      )
    }
  }
  const envOut = outputs.get('env')
  if (envOut !== undefined) {
    const orphaned = orphanedHoistedVars(plan)
    const out = envOut.analysis.t1().symbols
    for (const b of envOut.analysis.file.bindings) {
      if (orphaned.has(b.name) && out.isModuleLevel(out.ofBinding(b))) {
        problems.push(`env: declares ${b.name}, which only erased code read`)
      }
    }
  }
  // (f) planner facts are JSON data: a cached plan retains them as they are
  // (no Yuku node, no class instance, no `undefined` member)
  const facts = emitPlan.facts.planners
  if (!isDeepStrictEqual(facts, JSON.parse(JSON.stringify(facts)))) {
    problems.push('the planner facts are not JSON data')
  }
  if (problems.length > 0) {
    throw internalError(
      `compiler invariants violated for ${identity.canonicalId}:\n${problems.join('\n')}`,
    )
  }
}

/**
 * The declarators of a module whose pattern is empty (`var {} = f()`, `var
 * [, ,] = f()`), but in a `for…in/of` head. A pattern that binds nothing
 * and holds a pattern, a default or a computed key (`var { must: {} } =
 * cfg`) is code the source wrote for its effect: removal keeps it as
 * written (`removal/`, the sibling rule).
 */
function emptyDeclarators(program: Node): number {
  let n = 0
  const empty = (id: Node) =>
    (id.type === 'ObjectPattern' && id.properties.length === 0) ||
    (id.type === 'ArrayPattern' && id.elements.every((e) => e === null))
  const visit = (node: Node, parent: Node | null) => {
    if (
      node.type === 'VariableDeclaration' &&
      parent?.type !== 'ForInStatement' &&
      parent?.type !== 'ForOfStatement'
    ) {
      for (const d of node.declarations) {
        if (empty(d.id)) {
          n++
        }
      }
    }
    forEachChild(node, (child) => visit(child, node))
  }
  visit(program, null)
  return n
}

/**
 * The names of the source's `var`s declared once in a nested statement
 * (outside a `for…in/of` head) whose declarator's bindings were all read,
 * by value, only in text the env module erases.
 */
function orphanedHoistedVars(plan: AnalysisPlan): Set<string> {
  const { t1 } = plan
  const file = plan.analysis.file
  const live = plan.rewrites.liveness('env')
  const erasedOnly = (id: Node) => {
    const b = file.bindingOf(id)
    if (b === null || b.declarations.length !== 1) {
      return false
    }
    const refs = t1.refs.refsOf(t1.symbols.ofBinding(b))
    return refs.length > 0 && refs.every((r) => !live.live(r))
  }
  const names = new Set<string>()
  for (const b of file.bindings) {
    const sym = t1.symbols.ofBinding(b)
    const units = t1.declaringUnits.get(sym)
    if (
      !t1.symbols.isModuleLevel(sym) ||
      units === undefined ||
      units.some((u) => t1.units[u]!.kind !== 'effect')
    ) {
      continue
    }
    let declarator: Node | null = b.declarations[0] ?? null
    while (declarator !== null && declarator.type !== 'VariableDeclarator') {
      declarator = file.parentOf(declarator)
    }
    const declaration = declarator === null ? null : file.parentOf(declarator)
    const slot = declaration === null ? null : file.parentOf(declaration)
    if (
      declarator?.type !== 'VariableDeclarator' ||
      slot === null ||
      slot.type === 'ForInStatement' ||
      slot.type === 'ForOfStatement'
    ) {
      continue
    }
    const ids = patternIdentifiers(declarator.id)
    if (ids.every(erasedOnly)) {
      for (const id of ids) {
        names.add(id.name)
      }
    }
  }
  return names
}
