/**
 * Freezing a resolved plan into the plain-data `EmitPlan`: each output's
 * recipe, put together from pieces (the env module: its source text between
 * the statements placement rewrites, the generated units at their anchors
 * and the glue; the derived modules: header, glue imports, items and
 * generated units in order, the export glue) and its edges. `Renderer` is
 * the segment visitor of the output's walk (`OutputView.walk`), with
 * substitution environments and context-aware reference rewrites; no Yuku
 * object is reachable from the result.
 */
import { CHILD_KEYS } from 'yuku'
import { sameFileSpecifier } from './identity'
import { dedupeEdges, sourceEdges } from './edges'
import { specifierLiteral, specifierName } from './strings'
import { statementRecipe } from './units'
import { VALUE } from './declarations'
import {
  RecipeWriter,
  continuesStatement,
  isSpace,
  spaceAfter,
  spaceBefore,
  tokenStart,
} from './output-builder'
import { erases } from './rewrite'
import {
  DEST_CALLEE,
  GROUP_ARGUMENTS,
  GROUP_PARENS,
  REF_BINDING,
  REF_MEMBER,
  ROLE_MOVED,
  ROLE_REFERENCE,
  ROLE_VALUE,
  SHAPE_CALL,
  SHAPE_GROUPED,
  SHAPE_UNKNOWN,
  atStatementEdge,
  edgeOpens,
  needsGroup,
  needsValue,
  statementPrefix,
  tokensMeet,
  withRef,
} from './expression'
import { SELF_CHECKS, internalError } from './self-checks'
import type { Dest, Role, Shape } from './expression'
import type { ClassifiedRef, RefContext } from './analysis'
import type { EdgeView } from './edges'
import type {
  AnalysisPlan,
  EdgeRecord,
  FrozenPlan,
  OutputRecipe,
  PlanEdges,
  Segment,
} from './plan'
import type { OutputDecl, Placement, RootRef } from './placement'
import type { SymbolId } from './symbols'
import type { TopLevelItem, Unit, UnitId } from './units'
import type {
  Edit,
  Frag,
  GenFrag,
  GeneratedUnit,
  OutputId,
  OutputView,
  RangeNode,
  RefTarget,
  SubstEnv,
  SymRefContext,
  WalkOptions,
  WalkVisitor,
} from './rewrite'
import type { Node } from 'yuku'

export function freezePlan(plan: AnalysisPlan, revision: string): FrozenPlan {
  const placement = plan.placement ?? plan.resolve()
  const { analysis } = plan
  // two edits of one range that differ in an output, rendered or not
  plan.rewrites.checkConflicts(plan.outputs.keys())
  const code = analysis.source.code
  const outputs: Record<string, OutputRecipe> = {}
  const edges: PlanEdges = {}

  // export names for symbols other outputs import from their home
  const exportNameOf = new Map<OutputId, Map<SymbolId, string>>()
  /** Symbols whose export is glue (not an existing export of the module). */
  const glueExports = new Set<SymbolId>()
  // an export of the binding itself (`export default x` of a reassigned
  // `x`, or above its `var`, holds the value it had then)
  const existingExportName = (sym: SymbolId): string | null => {
    for (const e of analysis.exports) {
      if (
        e.kind === 'local' &&
        e.local === sym &&
        !e.typeOnly &&
        !(
          e.snapshot &&
          plan.t1.snapshotDiffers(sym, e.range.start, plan.liveness('env').live)
        )
      ) {
        return e.name
      }
    }
    return null
  }
  for (const [home, syms] of placement.exportsNeeded) {
    const map = new Map<SymbolId, string>()
    for (const s of [...syms].sort((a, b) => a - b)) {
      let name: string
      if (home === 'env') {
        const existing = existingExportName(s)
        if (existing !== null && !plan.exportedRenames.has(s)) {
          name = existing
        } else {
          name = plan.names.allocExportName(plan.glueExportBase(s))
          glueExports.add(s)
        }
      } else {
        name = plan.nameOf(s)
      }
      map.set(s, name)
    }
    exportNameOf.set(home, map)
  }

  const renderer = new Renderer(plan, code)
  // the units of each import declaration, once for every output
  const unitsOfImport = new Map<number, Array<Unit>>()
  for (const u of plan.t1.units) {
    if (u.importIndex !== null) {
      let list = unitsOfImport.get(u.importIndex)
      if (!list) {
        list = []
        unitsOfImport.set(u.importIndex, list)
      }
      list.push(u)
    }
  }

  for (const [id, decl] of plan.outputs) {
    const included = placement.included.get(id) ?? new Set()
    const recipeEdges: Array<EdgeRecord> = []
    const importerId = decl.derivedId ?? plan.identity.canonicalId
    renderer.begin(importerId, recipeEdges)
    if (id === 'env') {
      renderEnv(plan, renderer, placement, included, exportNameOf, glueExports)
    } else {
      renderDerived(plan, renderer, decl, placement, included, exportNameOf)
    }
    const segments = renderer.out.finish()
    recipeEdges.push(
      ...sourceEdges(
        plan.analysis,
        (raw, form) => plan.edgeKey(raw, form),
        importerId,
        outputView(plan, included, renderer.erasedAt, segments, unitsOfImport),
      ),
    )
    outputs[id] = {
      kind: decl.kind,
      derivedId: decl.derivedId,
      mapSource: plan.identity.path,
      segments,
      plainText: renderer.out.plainText(),
    }
    edges[id] = dedupeEdges(recipeEdges)
  }

  return {
    plan: {
      revision,
      outputs,
      facts: {
        marker: analysis.markers,
        planners: plan.facts,
      },
      dependencies: [],
      diagnostics: [
        ...plan.diagnostics.map((d) => ({
          ...d,
          range: d.range ? { ...d.range } : undefined,
        })),
      ],
    },
    edges,
  }
}

function includedUnitsOf(
  plan: AnalysisPlan,
  item: TopLevelItem,
  included: ReadonlySet<number>,
  placement: Placement,
  /** A derived output's roots; `null`: the env module. */
  roots: ReadonlyArray<RootRef> | null,
): Set<UnitId> {
  const derived = roots !== null
  const set = new Set<UnitId>()
  for (const uid of item.units) {
    const u = plan.t1.units[uid]!
    if (u.kind === 'type') {
      // type units stay in the env module (erased by TypeScript) whatever
      // their cluster, except the TypeScript-only syntax no output renders
      // (`Unit.stripped`); ambient value declarations (a type unit that
      // declares a value: `declare enum`, `declare var`, …, exported or
      // not) are copied: erased by TypeScript, but the transform after the
      // compiler reads them in the file that holds them (Vite 8's Oxc, with
      // any tsconfig, inlines the members of a `declare enum` and a
      // `declare const enum`, Rsbuild's SWC those of a `declare const
      // enum`), and the env module inlines what a derived output without
      // the declaration would read from a name that exists nowhere at
      // runtime (a `ReferenceError`). So is a type unit a planner
      // rooted in the output that the env module would keep (its text is
      // what the planner wants there)
      if (
        derived
          ? (u.spaces & VALUE) !== 0 ||
            (!u.stripped && roots.some((r) => r.t === 'unit' && r.id === uid))
          : !u.stripped
      ) {
        set.add(uid)
      }
      continue
    }
    const c = placement.clusterOfRegion.get(u.region)
    if (c !== undefined && included.has(c)) {
      set.add(uid)
    }
  }
  return set
}

/**
 * A piece of the env module at `start` of the source: generated text
 * (`end === start`), or a statement placement rewrites (its owned range,
 * `body` its recipe). The text between the pieces is the walk's.
 */
interface EnvPiece {
  start: number
  end: number
  body: ReadonlyArray<Frag | GenFrag>
  gen: GeneratedUnit | null
}

/**
 * The env module: the source's text (the walk) between its pieces, which are
 * the statements placement rewrites, the generated units at their anchors,
 * the glue imports after the header and the export glue at the end. The
 * pieces at one position render in that order: the glue imports, the
 * generated units, the statement; what a planner inserts there renders
 * before them. Every piece is a statement of the module, and so is the
 * source's text after one (`Renderer.statementStart`).
 */
function renderEnv(
  plan: AnalysisPlan,
  renderer: Renderer,
  placement: Placement,
  included: ReadonlySet<number>,
  exportNameOf: Map<OutputId, Map<SymbolId, string>>,
  glueExports: ReadonlySet<SymbolId>,
): void {
  const { t1, rewrites, analysis } = plan
  const { items, units } = t1
  const code = analysis.source.code
  const envView = rewrites.view('env')
  /** The statements placement rewrites (their removals), in source order. */
  const rewritten: Array<EnvPiece> = []
  const anchored = anchoredGenerated(plan, 'env', placement)
  /** Exported declarators of statements whose `export` keyword a sibling's rename drops. */
  const siblingExports: Array<{ sym: SymbolId; name: string }> = []
  for (const item of items) {
    if (envView.isErasedAt(item.nodeRange.start)) {
      continue // (its text is a planner's)
    }
    const retained = includedUnitsOf(plan, item, included, placement, null)
    let keepExport = true
    for (const uid of item.units) {
      const u = units[uid]!
      for (const s of u.declares) {
        if (plan.exportedRenames.has(s)) {
          keepExport = false
        }
      }
    }
    if (!keepExport && item.exportKeyword !== null) {
      // the statement loses its `export` keyword for the renamed binding
      // (re-exported under its public name by the glue); the other
      // exported bindings of the statement, in the renamed declarator too
      // (`export const { component, meta } = …`), stay exported under their
      // own names through the same glue
      for (const uid of item.units) {
        const u = units[uid]!
        if (!retained.has(uid)) {
          continue
        }
        for (const s of u.declares) {
          const name = plan.symbols.name(s)
          if (!plan.exportedRenames.has(s) && u.exported.includes(name)) {
            siblingExports.push({ sym: s, name })
          }
        }
      }
    }
    const recipe = statementRecipe(item, units, retained, keepExport, code)
    if (recipe !== 'keep') {
      rewritten.push({
        start: item.range.start,
        end: item.range.end,
        body: recipe === 'drop' ? [] : recipe,
        gen: null,
      })
    }
  }
  // glue imports of the env output (from shared/derived homes) after the header
  const glueImports = glueImportText(
    plan,
    'env',
    placement,
    exportNameOf,
    anchored.map((a) => a.gen),
  )
  // export glue at the end (re-exports of the shared module's exports first)
  const exportsText = [
    ...reexportGlue(plan, placement, exportNameOf),
    ...exportGlue(
      plan,
      'env',
      placement,
      exportNameOf,
      glueExports,
      siblingExports,
    ),
  ]
  // (in the order they render at one position: by start, stable)
  const pieces: Array<EnvPiece> = []
  if (glueImports.length > 0) {
    const at = analysis.header.end
    pieces.push({ start: at, end: at, body: glueImports, gen: null })
  }
  for (const { at, gen } of anchored) {
    pieces.push({ start: at, end: at, body: gen.body, gen })
  }
  pieces.push(...rewritten)
  if (exportsText.length > 0) {
    pieces.push({
      start: code.length,
      end: code.length,
      body: exportsText,
      gen: null,
    })
  }
  pieces.sort((x, y) => x.start - y.start)
  // what the rewritten statements remove decides the bytes nothing in the
  // tree decides (in source order, disjoint)
  renderer.setView(envView, (offset) => {
    const decided = envView.erasedBy(offset)
    if (decided !== null) {
      return decided
    }
    let lo = 0
    let hi = rewritten.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const x = rewritten[mid]!
      if (offset < x.start) {
        hi = mid - 1
      } else if (offset >= x.end) {
        lo = mid + 1
      } else {
        return erases(x.body, offset)
      }
    }
    return false
  })
  const root = rewrites.regions.module
  let pos = 0
  /** The inserts at `pos` rendered with the text before it (a piece followed them). */
  let skipAt: number | null = null
  // an insert at the start of a statement placement rewrites is that
  // statement's text (its owner is a unit of it): it renders with what the
  // statement keeps, never with the text before it
  const rewrittenAt = new Set(rewritten.map((p) => p.start))
  /** A piece rendered before the text at `pos` (its statement follows something else than its source predecessor). */
  let afterEdit = false
  for (const p of pieces) {
    renderer.renderSpan(root, pos, p.start, null, null, {
      skipAt,
      includeEnd: !rewrittenAt.has(p.start),
      afterEdit,
    })
    renderer.renderPiece(p.start, p.body, p.gen, p.end > p.start)
    afterEdit = true
    pos = p.end
    skipAt = p.end === p.start ? pos : null
  }
  renderer.renderSpan(root, pos, code.length, null, null, {
    skipAt,
    includeEnd: true,
    afterEdit,
  })
  renderer.keepPragmasLate(0)
}

function anchoredGenerated(
  plan: AnalysisPlan,
  output: OutputId,
  placement: Placement,
): Array<{ at: number; order: number; gen: GeneratedUnit }> {
  const { items, units } = plan.t1
  const out: Array<{ at: number; order: number; gen: GeneratedUnit }> = []
  const included = placement.included.get(output) ?? new Set()
  const code = plan.analysis.source.code
  for (const gen of plan.rewrites.generated) {
    const c = placement.clusterOfGen.get(gen.id)
    if (c === undefined || !included.has(c)) {
      continue
    }
    let at: number
    let order: number
    switch (gen.anchor.k) {
      case 'after-header':
        at = plan.analysis.header.end
        order = 0
        break
      case 'before-unit':
        at = items[units[gen.anchor.unit]!.item]!.range.start
        order = 1
        break
      case 'end':
        at = code.length
        order = 2
        break
    }
    out.push({ at, order, gen })
  }
  out.sort((a, b) => a.at - b.at || a.order - b.order || a.gen.id - b.gen.id)
  return out
}

function glueImportText(
  plan: AnalysisPlan,
  output: OutputId,
  placement: Placement,
  exportNameOf: Map<OutputId, Map<SymbolId, string>>,
  gens: ReadonlyArray<GeneratedUnit>,
): Array<Frag> {
  const frags: Array<Frag> = []
  const imports = placement.imports.get(output)
  if (imports) {
    for (const [home, syms] of [...imports].sort(([a], [b]) =>
      a < b ? -1 : 1,
    )) {
      const homeDecl = plan.outputs.get(home)
      const targetId = homeDecl?.derivedId ?? plan.identity.canonicalId
      const names = [...syms]
        .sort((a, b) => a - b)
        .map((s) => {
          const exported = exportNameOf.get(home)?.get(s) ?? plan.nameOf(s)
          const local = plan.nameOf(s)
          return exported === local
            ? local
            : `${specifierName(exported)} as ${local}`
        })
      frags.push({
        k: 'text',
        parts: [`import { ${names.join(', ')} } from `],
      })
      frags.push({
        k: 'spec',
        specifier: sameFileSpecifier(targetId),
        edgeKey: plan.edgeKey(sameFileSpecifier(targetId), 'static', 'runtime'),
      })
      frags.push({ k: 'text', parts: ['\n'] })
    }
  }
  for (const gen of gens) {
    for (const gi of gen.imports ?? []) {
      const names = gi.names.map((n) => {
        const local = plan.symbols.name(n.local)
        return n.imported === local ? local : `${n.imported} as ${local}`
      })
      frags.push({
        k: 'text',
        parts: [`import { ${names.join(', ')} } from `],
      })
      frags.push(gi.spec)
      frags.push({ k: 'text', parts: ['\n'] })
    }
  }
  return frags
}

/** `export { x as name, … } from '/path/file?tsr-split=shared---…'` for the exported names the shared module holds (`Placement.sharedExports`). */
function reexportGlue(
  plan: AnalysisPlan,
  placement: Placement,
  exportNameOf: Map<OutputId, Map<SymbolId, string>>,
): Array<Frag> {
  // (an export statement the env module keeps, `export { x as y }` or
  // `export default x`, exports the binding it imports itself; the unit of
  // `export default x` declares only its synthetic `default`)
  const envIncluded = placement.included.get('env')
  const keptByEnv = (range: { start: number; end: number }) => {
    const u = plan.t1.unitAt(range)
    const c =
      u === null
        ? undefined
        : placement.clusterOfRegion.get(plan.t1.units[u]!.region)
    return (
      c !== undefined &&
      (plan.t1.units[u!]!.declares.length === 0 ||
        plan.t1.units[u!]!.kind === 'export-default') &&
      envIncluded?.has(c) === true
    )
  }
  const decl = placement.shared
  if (decl === null || decl.derivedId === null) {
    return []
  }
  const parts: Array<string> = []
  for (const s of [...placement.sharedExports].sort((a, b) => a - b)) {
    const exported = exportNameOf.get(decl.id)?.get(s) ?? plan.nameOf(s)
    for (const x of plan.analysis.exports) {
      if (
        x.kind === 'local' &&
        x.local === s &&
        !x.typeOnly &&
        !keptByEnv(x.range)
      ) {
        const part =
          exported === x.name
            ? exported
            : `${exported} as ${specifierName(x.name)}`
        // (merged declarations are one export row each)
        if (!parts.includes(part)) {
          parts.push(part)
        }
      }
    }
  }
  if (parts.length === 0) {
    return []
  }
  const specifier = sameFileSpecifier(decl.derivedId)
  return [
    { k: 'text', parts: [`export { ${parts.join(', ')} } from `] },
    {
      k: 'spec',
      specifier,
      edgeKey: plan.edgeKey(specifier, 'reexport', 'runtime'),
    },
    { k: 'text', parts: ['\n'] },
  ]
}

function exportGlue(
  plan: AnalysisPlan,
  output: OutputId,
  placement: Placement,
  exportNameOf: Map<OutputId, Map<SymbolId, string>>,
  glueExports: ReadonlySet<SymbolId> | null = null,
  siblingExports: ReadonlyArray<{ sym: SymbolId; name: string }> = [],
): Array<Frag> {
  const parts: Array<string> = []
  const names = exportNameOf.get(output)
  if (names) {
    for (const [s, exported] of names) {
      if (glueExports !== null && !glueExports.has(s)) {
        continue
      }
      const local = plan.nameOf(s)
      parts.push(exported === local ? local : `${local} as ${exported}`)
    }
  }
  for (const { sym, name } of siblingExports) {
    const local = plan.nameOf(sym)
    const part = name === local ? local : `${local} as ${name}`
    if (!parts.includes(part)) {
      parts.push(part)
    }
  }
  if (output === 'env') {
    const sharedSyms = new Set(placement.sharedExports)
    for (const [sym, to] of plan.exportedRenames) {
      if (sharedSyms.has(sym)) {
        continue // re-exported from the shared module under its public names
      }
      const local = 'sym' in to ? plan.symbols.name(to.sym) : null
      if (local === null) {
        continue
      }
      parts.push(`${local} as ${plan.symbols.name(sym)}`)
    }
  }
  if (parts.length === 0) {
    return []
  }
  return [{ k: 'text', parts: [`export { ${parts.join(', ')} }\n`] }]
}

function renderDerived(
  plan: AnalysisPlan,
  renderer: Renderer,
  decl: OutputDecl,
  placement: Placement,
  included: ReadonlySet<number>,
  exportNameOf: Map<OutputId, Map<SymbolId, string>>,
): void {
  const { t1, rewrites, analysis } = plan
  const { items, units } = t1
  const code = analysis.source.code
  const view = rewrites.view(decl.id)
  renderer.setView(view, (offset) => view.isErasedAt(offset))
  const root = rewrites.regions.module
  const out = renderer.out
  const anchored = anchoredGenerated(plan, decl.id, placement)
  const empty =
    included.size === 0 &&
    anchored.length === 0 &&
    (placement.imports.get(decl.id)?.size ?? 0) === 0
  if (empty) {
    out.push({ k: 'text', text: 'export {}\n' })
    return
  }
  // header: the comments holding pragmas, as written (a license notice
  // with them: the host reads a copy as it reads the source), and the
  // directives, in the source's order (a pragma after a directive is no
  // pragma to TypeScript, before one it is)
  const header = analysis.header
  const kept = header.directives.filter(
    (d) => !decl.header?.dropDirectives?.includes(d.value),
  )
  for (let pi = 0, di = 0; pi < header.pragmas.length || di < kept.length; ) {
    const p = header.pragmas[pi]
    const d = kept[di]
    const range =
      p !== undefined && (d === undefined || p.range.start < d.range.start)
        ? header.pragmas[pi++]!.range
        : kept[di++]!.range
    renderer.renderSpan(root, range.start, range.end, null, null)
    out.push({ k: 'text', text: '\n' })
  }
  if (decl.header?.addDirective) {
    out.push({
      k: 'text',
      text: `${specifierLiteral(decl.header.addDirective)}\n`,
    })
  }
  const body = out.length
  // glue imports
  renderer.renderFrags(
    glueImportText(
      plan,
      decl.id,
      placement,
      exportNameOf,
      anchored.map((a) => a.gen),
    ),
    null,
    null,
    null,
  )
  // pieces in order: generated units by anchor, items by position
  interface Piece {
    pos: number
    order: number
    /** Where the source has the statement's first token (-1: generated). */
    offset: number
    render: () => void
  }
  const pieces: Array<Piece> = []
  // in derived outputs, after-header units follow the included import statements
  let importsEnd = -1
  for (const item of items) {
    const inc = includedUnitsOf(plan, item, included, placement, decl.roots)
    if (inc.size === 0) {
      continue
    }
    if (item.kind === 'ImportDeclaration') {
      importsEnd = Math.max(importsEnd, item.range.end)
    }
    const recipe = statementRecipe(item, units, inc, false, code)
    if (recipe === 'drop') {
      continue
    }
    pieces.push({
      pos: item.range.start,
      order: 2,
      offset: recipe === 'keep' ? item.nodeRange.start : -1,
      render:
        recipe === 'keep'
          ? () =>
              renderer.renderSpan(
                root,
                item.range.start,
                item.range.end,
                null,
                null,
              )
          : () => renderer.renderFrags(recipe, null, null, root),
    })
  }
  for (const a of anchored) {
    const pos =
      a.gen.anchor.k === 'after-header'
        ? importsEnd
        : a.gen.anchor.k === 'end'
          ? Infinity
          : a.at
    // after-header: after the last included import (it starts before its end),
    // before a statement starting where it ends and what is anchored before it
    const order = a.gen.anchor.k === 'after-header' ? -1 : 0
    pieces.push({
      pos,
      order,
      offset: -1,
      render: () => renderer.renderFrags(a.gen.body, a.gen, null, null),
    })
  }
  pieces.sort((x, y) => x.pos - y.pos || x.order - y.order)
  for (const p of pieces) {
    const from = out.length
    p.render()
    renderer.statementStart(p.offset, from, true)
  }
  const from = out.length
  renderer.renderFrags(
    exportGlue(plan, decl.id, placement, exportNameOf, null),
    null,
    null,
    null,
  )
  renderer.statementStart(-1, from, true)
  renderer.keepPragmasLate(body)
}

/** What of the module renders in `output` (`sourceEdges`): the units it includes, its tree's erasures, its rendered segments. */
function outputView(
  plan: AnalysisPlan,
  included: ReadonlySet<number>,
  erasedAt: (offset: number) => boolean,
  segments: ReadonlyArray<Segment>,
  unitsOfImport: ReadonlyMap<number, ReadonlyArray<Unit>>,
): EdgeView {
  const { units } = plan.t1
  const includedUnit = (u: Unit) => {
    const c = plan.placement!.clusterOfRegion.get(u.region)
    return c !== undefined && included.has(c)
  }
  return {
    importLocals: (imp) => {
      const live = (unitsOfImport.get(imp.index) ?? []).filter(
        (u) => u.kind !== 'type' && includedUnit(u),
      )
      return live.length === 0
        ? null
        : new Set(
            live
              .filter((u) => u.kind === 'import-specifier')
              .flatMap((u) => u.declares),
          )
    },
    erasedAt,
    reexports: (range) => {
      const id = plan.t1.unitAt(range)
      const unit = id === null ? undefined : units[id]!
      return unit?.kind === 'reexport' && includedUnit(unit)
    },
    dynamic: ({ start, end }) =>
      segments.some((s) => s.k === 'slice' && s.start <= start && s.end >= end),
  }
}

interface SpanOptions extends WalkOptions {
  /** Something other than source text rendered before the span (a statement its source text starts is separated from it). */
  afterEdit?: boolean
}

const NO_SPAN_OPTIONS: SpanOptions = {}

/** The span being rendered (`Renderer.renderSpan`); one record per depth of nested spans, reused. */
interface Span {
  owner: GeneratedUnit | null
  env: SubstEnv | null
  /** The references the substitution environment rewrites in the span's source (one inside an active node renders with it). */
  subst: Array<ClassifiedRef> | null
  si: number
  /**
   * The source text after an edit: the statement it starts may follow what
   * the edit left (a removed `const local = 1;` before `(mk)()`).
   */
  afterEdit: boolean
}

/**
 * An expression boundary being rendered (`expression.ts`), in the one it is
 * nested in: what rendered on its kept node reports itself here.
 */
interface Boundary {
  /** Its reserved opening segment (written when it closes); a boundary rendering bare shares its outer one's. */
  at: number
  /** The range of its kept node inside its wrappers (-1: none, or generated text). */
  coreStart: number
  coreEnd: number
  /** A group or a TypeScript wrapper renders around the core (`ExprBoundary.wrapped`): what renders on it reports its reference only. */
  wrapped: boolean
  /** The shape what rendered on the core reported in place of the boundary's (-1: none): an edit's or a placeholder's text, a nested boundary. */
  shape: number
  /** The reference what rendered on the core reported (-1: none): a substituted or renamed reference. */
  ref: number
  outer: Boundary | null
}

/** A statement and the statement list it stands in (`Renderer.statementAt`). */
interface ListedStatement {
  /** null: a statement of the module the source does not have (a piece). */
  node: Node | null
  /** The module, or the block, static block, case or namespace body holding the list. */
  list: Node
  /** The list is a function's body (it starts with a directive prologue, as the module's). */
  functionBody: boolean
}

/**
 * Renders ranges and fragments of one output into its segments (`out`): the
 * segment visitor of the output's walk (`OutputView.walk`: source text,
 * active nodes whole, inserts), applying substitution environments and
 * context-aware reference rewrites. Its state is two stacks, the span and
 * the expression boundary being rendered; the characters of what rendered
 * are `out`'s to read (`RecipeWriter`).
 */
class Renderer {
  view!: OutputView
  erasedAt!: (offset: number) => boolean
  out!: RecipeWriter
  private importerId!: string
  private edges!: Array<EdgeRecord>
  private span: Span | null = null
  private readonly spans: Array<Span> = []
  private depth = 0
  private boundary: Boundary | null = null
  /** Where the last in-place boundary ended, and its last character: an edit or an insert rendering there meets it (rule L). */
  private boundaryEnd = -1
  private boundaryLast = ''
  private moduleStarts: Set<number> | undefined = undefined
  constructor(
    private readonly plan: AnalysisPlan,
    private readonly code: string,
  ) {}

  begin(importerId: string, edges: Array<EdgeRecord>): void {
    this.importerId = importerId
    this.edges = edges
    this.out = new RecipeWriter(this.code)
    this.boundaryEnd = -1
  }

  /** What the output renders, and whether an original byte renders in no text of it (`sourceEdges`). */
  setView(view: OutputView, erasedAt: (offset: number) => boolean): void {
    this.view = view
    this.erasedAt = erasedAt
  }

  /**
   * Renders a piece of the env module (`EnvPiece`), a statement of the
   * module. A statement placement rewrites (`rewrites`: its body names its
   * text) owns the inserts at its start: they render first, once, and none
   * of its body's slices renders them again.
   */
  renderPiece(
    start: number,
    body: ReadonlyArray<Frag | GenFrag>,
    gen: GeneratedUnit | null,
    rewrites: boolean,
  ): void {
    const from = this.out.length
    if (rewrites && body.length > 0) {
      const root = this.plan.rewrites.regions.module
      this.renderSpan(root, start, start, null, null, { includeEnd: true })
      this.renderFrags(body, gen, null, root, start)
    } else {
      this.renderFrags(body, gen, null, null)
    }
    this.statementStart(-1, from, true)
  }

  /** The segment visitor of the walk, one per renderer (its state is the span's). */
  private readonly spanVisitor: WalkVisitor = {
    source: (s, e) => {
      const span = this.span!
      const subst = span.subst
      let pos = s
      if (subst !== null) {
        const env = span.env!
        const out = this.out
        while (span.si < subst.length && subst[span.si]!.range.start < s) {
          span.si++ // (inside an active node)
        }
        while (span.si < subst.length && subst[span.si]!.range.start < e) {
          const ref = subst[span.si++]!
          if (ref.range.start > pos) {
            this.copy(pos, ref.range.start)
          }
          const afterEdit = span.afterEdit
          span.afterEdit = false
          const at = out.length
          const text = this.renderRefText(
            ref.ctx,
            env.get(ref.sym)!,
            env,
            ref.exportShorthand,
            this.code.slice(ref.range.start, ref.range.end),
          )
          this.reportRef(ref.range.start, ref.range.end, text)
          out.push({ k: 'text', text, mapTo: ref.range.start })
          // a callee at a statement's start renders `(0, props.x)`: as an edit
          this.statementStart(ref.range.start, at, afterEdit)
          pos = Math.max(pos, ref.range.end)
        }
      }
      if (e > pos) {
        this.copy(pos, e)
      }
    },
    node: (n) => {
      const span = this.span!
      const afterEdit = span.afterEdit
      span.afterEdit = true
      const out = this.out
      const at = out.length
      const meet = this.meetsBoundary(n.start)
      const last = this.boundaryLast
      const place = this.view.placeholderOf(n)
      if (place !== null) {
        const claimed = 'owner' in place
        this.renderFrags(
          claimed ? place.placeholder : place.body,
          span.owner,
          span.env,
          n,
        )
        const b = this.boundary
        if (b !== null && n.start === b.coreStart && n.end === b.coreEnd) {
          b.shape = (!claimed && place.shape) || SHAPE_UNKNOWN
        }
      } else {
        this.renderEdit(n, this.view.editOf(n)!, span.owner, span.env)
      }
      this.meetBoundary(meet, last, n.end)
      this.statementStart(n.start, at, afterEdit)
    },
    insert: (e) => {
      const span = this.span!
      const afterEdit = span.afterEdit
      span.afterEdit = true
      const at = this.out.length
      const meet = this.meetsBoundary(e.range.start)
      const last = this.boundaryLast
      this.renderFrags(e.body, span.owner, span.env, null)
      this.meetBoundary(meet, last, e.range.start)
      this.statementStart(e.range.start, at, afterEdit)
    },
  }

  /** Renders `[start, end)` of `level`'s text (`OutputView.walk`). */
  renderSpan(
    level: RangeNode,
    start: number,
    end: number,
    owner: GeneratedUnit | null,
    env: SubstEnv | null,
    opts: SpanOptions = NO_SPAN_OPTIONS,
  ): void {
    let subst: Array<ClassifiedRef> | null = null
    if (env && env.size > 0) {
      subst = []
      for (const ref of this.plan.t1.refs.refsIn({ start, end })) {
        if (env.has(ref.sym) && ref.kind !== 'exportSpecifier') {
          subst.push(ref)
        }
      }
    }
    // (a span renders spans inside it, through the bodies it renders: the
    // stack of their records, one per depth)
    const outer = this.span
    const depth = this.depth++
    let span = this.spans[depth]
    if (span === undefined) {
      span = { owner, env, subst, si: 0, afterEdit: false }
      this.spans.push(span)
    } else {
      span.owner = owner
      span.env = env
      span.subst = subst
      span.si = 0
    }
    span.afterEdit = opts.afterEdit === true
    this.span = span
    this.view.walk(level, start, end, this.spanVisitor, opts)
    this.span = outer
    this.depth = depth
  }

  /** Copies source text of the span (after an edit, a statement it starts is separated from what precedes). */
  private copy(pos: number, to: number): void {
    const out = this.out
    if (!this.span!.afterEdit) {
      out.push({ k: 'slice', start: pos, end: to })
      return
    }
    // a `;` goes after the indentation, before a comment (an annotation
    // stays with its call)
    let from = pos
    while (from < to && isSpace(this.code.charCodeAt(from))) {
      from++
    }
    if (from > pos) {
      out.push({ k: 'slice', start: pos, end: from })
    }
    const at = out.length
    out.push({ k: 'slice', start: from, end: to })
    this.statementStart(tokenStart(this.code, from, to), at, true)
  }

  /**
   * Renders fragments: `level`, the node whose text the body's slices are
   * (none in a generated unit, which names source text as the regions it
   * claims); `skipAt`, where the inserts rendered before the body (a
   * rewritten statement's start, `renderPiece`).
   */
  renderFrags(
    frags: ReadonlyArray<Frag | GenFrag>,
    owner: GeneratedUnit | null,
    env: SubstEnv | null,
    level: RangeNode | null,
    skipAt: number | null = null,
  ): void {
    const out = this.out
    const mergedEnv = mergeEnv(env, owner?.env)
    // the generated unit's own body (not an edit, a placeholder, an insert
    // or what a region renders): its mapped text stands for no source text
    const ownBody = owner !== null && level === null && frags === owner.body
    for (const f of frags) {
      switch (f.k) {
        case 'slice': {
          if (
            level === null ||
            f.range.start < level.start ||
            f.range.end > level.end
          ) {
            throw internalError(
              `conflict: a body copies [${f.range.start}, ${f.range.end}), outside the text it rewrites${level ? ` [${level.start}, ${level.end})` : ''}`,
            )
          }
          this.renderSpan(
            level,
            f.range.start,
            f.range.end,
            owner,
            mergedEnv,
            skipAt === null ? NO_SPAN_OPTIONS : { skipAt },
          )
          break
        }
        case 'region': {
          // a claimed region, rendered by its owner: its text
          const claim = this.plan.rewrites.claims.get(f.id)
          if (
            claim === undefined ||
            owner === null ||
            claim.owner !== owner.id
          ) {
            throw internalError(
              `conflict: a generated unit renders region ${f.id}, which it does not claim`,
            )
          }
          const node = this.plan.rewrites.regions.nodeOn(
            this.plan.regions.get(f.id).range,
          )!
          if (!this.view.isClaimed(node) && !this.view.isErasedAround(node)) {
            // (claimed for other outputs: its text stands at its place here)
            throw internalError(
              `conflict: region ${f.id} renders in its owner and at its place in ${this.view.output}`,
            )
          }
          // (its text is out of the module's order: no boundary outside it
          // meets it, none inside it meets what follows)
          this.boundaryEnd = -1
          const expr = f.expr
          const at = out.length
          const open = expr === undefined ? null : this.openExpr(node, false)
          if (expr?.head !== undefined) {
            out.push({ k: 'text', text: expr.head })
          }
          const edit = this.view.editOf(node)
          if (edit === null) {
            this.renderSpan(node, node.start, node.end, owner, mergedEnv)
          } else {
            this.renderEdit(node, edit, owner, mergedEnv)
          }
          if (open !== null) {
            this.closeExpr(open, expr!.dest, ROLE_MOVED, expr!.shape, -1)
          }
          if (edit !== null) {
            this.statementStart(node.start, at, false)
          }
          this.boundaryEnd = -1
          break
        }
        case 'text': {
          let text = ''
          for (const p of f.parts) {
            if (typeof p === 'string') {
              text += p
            } else {
              text += this.renderSymRef(p.sym, p.ctx ?? 'expr', mergedEnv)
            }
          }
          if (text.length > 0) {
            out.push(
              f.mapTo === undefined
                ? { k: 'text', text }
                : ownBody
                  ? { k: 'text', text, mapTo: f.mapTo, gen: true }
                  : { k: 'text', text, mapTo: f.mapTo },
            )
          }
          break
        }
        case 'spec': {
          out.push({
            k: 'text',
            text: specifierLiteral(f.specifier),
            edgeKey: f.edgeKey,
          })
          this.edges.push({
            importerId: this.importerId,
            edgeKey: f.edgeKey,
            form: f.form ?? 'static',
            kind: f.form === 'dynamic' ? 'evaluation' : 'binding',
            specifier: f.specifier,
            locations: [],
            names: [],
            provenance: { origin: 'runtime' },
          })
          break
        }
        case 'ref': {
          const text = this.renderRefText(
            f.ctx,
            f.to,
            mergedEnv,
            f.exportShorthand,
            this.code.slice(f.range.start, f.range.end),
          )
          this.reportRef(f.range.start, f.range.end, text)
          out.push({ k: 'text', text, mapTo: f.range.start })
          break
        }
      }
    }
  }

  // ---- expression boundaries (`expression.ts`) ----

  /**
   * Renders node `n`'s edit. A boundary's body renders as one expression,
   * wrapped where it stands; bare when it is all of the open boundary's kept
   * node, which wraps it once (it has no position of its own): what rendered
   * on its own core reports the shape it resolves to, as its closing would.
   * Under a wrapper of the open boundary (`inner() as Fn`) it has one, the
   * wrapper's operand: it is wrapped there. What renders on the open
   * boundary's kept node reports its shape.
   */
  private renderEdit(
    n: RangeNode,
    edit: Edit,
    owner: GeneratedUnit | null,
    env: SubstEnv | null,
  ): void {
    const b = edit.expr
    const top = this.boundary
    const atCore =
      top !== null && n.start === top.coreStart && n.end === top.coreEnd
    if (b === undefined) {
      this.renderFrags(edit.body, owner, env, n)
      if (atCore && top.ref === -1) {
        top.shape = edit.shape ?? SHAPE_UNKNOWN
      }
      return
    }
    if (atCore && !top.wrapped) {
      // (bare: the open boundary's opening is its own)
      const bare = this.pushBoundary(top.at, b.core, b.wrapped)
      this.renderFrags(edit.body, owner, env, n)
      this.boundary = top
      top.shape = rendered(bare, b.shape)
      return
    }
    const open = this.openExpr(b.core, b.wrapped)
    this.renderFrags(edit.body, owner, env, n)
    const shape = this.closeExpr(open, b.dest, ROLE_VALUE, b.shape, n.end)
    if (atCore) {
      top.shape = shape
    }
  }

  /** A reference rendered as `text` on `[start, end)`: on the open boundary's kept node, it is what renders there. */
  private reportRef(start: number, end: number, text: string): void {
    const b = this.boundary
    if (b !== null && start === b.coreStart && end === b.coreEnd) {
      b.ref = text.includes('.') ? REF_MEMBER : REF_BINDING
    }
  }

  private pushBoundary(
    at: number,
    core: { start: number; end: number } | null,
    wrapped: boolean,
  ): Boundary {
    const b: Boundary = {
      at,
      coreStart: core?.start ?? -1,
      coreEnd: core?.end ?? -1,
      wrapped,
      shape: -1,
      ref: -1,
      outer: this.boundary,
    }
    this.boundary = b
    return b
  }

  /** Opens a boundary around what renders next: its opening text is reserved (written when it closes, `closeExpr`). */
  private openExpr(
    core: { start: number; end: number } | null,
    wrapped: boolean,
  ): Boundary {
    return this.pushBoundary(this.out.reserve(), core, wrapped)
  }

  /**
   * Closes a boundary: V, G and L (`expression.ts`) on the shape that
   * rendered, the opening text in the reserved segment (mapped to the first
   * token it wraps), the closing text after (a `)` joins generated text it
   * closes that is mapped). `end`: the source offset the
   * boundary ends at in place (-1: a recipe's position). Returns the shape
   * it rendered (a group once V or G wrapped it).
   */
  private closeExpr(
    open: Boundary,
    dest: Dest,
    role: Role,
    planned: Shape,
    end: number,
  ): Shape {
    const out = this.out
    const shape = rendered(open, planned)
    this.boundary = open.outer
    const from = open.at + 1
    let prefix = ''
    let suffix = ''
    const whole = statementPrefix(dest, shape)
    if (whole !== null) {
      prefix = whole
      suffix = whole === '(void (' ? '))' : ')'
    } else if (needsValue(dest, role, shape)) {
      prefix = '(0, '
      suffix = ')'
    } else {
      const group = needsGroup(
        dest,
        shape,
        atStatementEdge(dest) && edgeOpens(out.renderedText(from)),
      )
      if (group === GROUP_PARENS) {
        prefix = '('
        suffix = ')'
      } else if (group === GROUP_ARGUMENTS) {
        suffix = '()'
      }
    }
    let opening = prefix
    let mapTo = prefix === '' ? undefined : out.firstMapped(from)
    if (tokensMeet(dest)) {
      // (what renders before it inside the boundary it opens in: at that
      // one's start, the opening still to be written decides, `(` or a space)
      const after = this.boundary?.at ?? -1
      const a = out.charBefore(open.at, 0, after)
      if (
        spaceBefore(
          a === '/' ? out.charBefore(open.at, 1, after) : '',
          a,
          prefix.charAt(0) || out.firstChar(from),
        )
      ) {
        opening = ' ' + prefix
        mapTo = undefined
      }
      if (end >= 0) {
        const last =
          suffix === ''
            ? out.charBefore(out.length, 0)
            : suffix.charAt(suffix.length - 1)
        if (spaceAfter(last, this.code.charAt(end))) {
          suffix += ' '
        } else {
          this.boundaryEnd = end
          this.boundaryLast = last
        }
      }
    }
    // (a closing parenthesis after generated text mapped to the source is
    // that text's: it maps with the text it closes, as a callee's `(0, x)`)
    if (suffix.charCodeAt(0) === 41 /* ) */) {
      const i = out.lastRendered(from)
      const seg = i === -1 ? undefined : out.segments[i]!
      if (
        seg?.k === 'text' &&
        seg.mapTo !== undefined &&
        seg.edgeKey === undefined &&
        seg.gen === undefined
      ) {
        out.set(i, { k: 'text', text: seg.text + ')', mapTo: seg.mapTo })
        suffix = suffix.slice(1)
      }
    }
    // (a new segment, not the reserved one written: every text segment of
    // a recipe has one of the shapes the emitter reads)
    if (opening !== '') {
      const next = out.segments[open.at + 1]
      if (
        mapTo !== undefined &&
        next?.k === 'text' &&
        next.mapTo === mapTo &&
        next.edgeKey === undefined &&
        next.gen === undefined
      ) {
        // (the text it maps to follows: one segment, which every position
        // of either resolves to as before; the emptied one is dropped)
        out.set(open.at, { k: 'text', text: opening + next.text, mapTo })
        out.set(open.at + 1, { k: 'text', text: '' })
      } else {
        out.set(
          open.at,
          mapTo === undefined
            ? { k: 'text', text: opening }
            : { k: 'text', text: opening, mapTo },
        )
      }
    }
    if (suffix !== '') {
      out.push({ k: 'text', text: suffix })
    }
    // (only `(0, …)` and `(void …)` make no reference of one: a group keeps
    // what it holds, `(obj.m)()` calls with `this`)
    return prefix === '(0, ' || prefix.startsWith('(void ')
      ? SHAPE_GROUPED
      : prefix !== ''
        ? withRef(SHAPE_GROUPED, shape)
        : suffix.startsWith('()')
          ? SHAPE_CALL
          : shape
  }

  /** Before rendering at `offset`: the index of a reserved segment when the last boundary ended there (`meetBoundary`), else -1. */
  private meetsBoundary(offset: number): number {
    if (offset !== this.boundaryEnd) {
      return -1
    }
    this.boundaryEnd = -1
    return this.out.reserve()
  }

  /**
   * Rule L where an edit or an insert renders right after a boundary: a
   * space when their characters would merge. One that renders nothing
   * leaves the boundary meeting what follows it, at `next`: the source's
   * character there, or what renders there next.
   */
  private meetBoundary(at: number, last: string, next: number): void {
    if (at === -1) {
      return
    }
    const first = this.out.firstChar(at + 1)
    if (first !== '') {
      if (spaceAfter(last, first)) {
        this.out.set(at, { k: 'text', text: ' ' })
      }
    } else if (spaceAfter(last, this.code.charAt(next))) {
      this.out.set(at, { k: 'text', text: ' ' })
    } else {
      this.boundaryEnd = next
      this.boundaryLast = last
    }
  }

  // ---- statement separation ----

  /**
   * A statement of a list starts with what renders from segment `from` on
   * (`offset`: its first token in the source; -1: a statement of the
   * module the source does not have there, a piece), and `separate`:
   * something other than its source predecessor renders before it. The one
   * rule separating it from what renders before it, wherever that comes
   * from (an edit, a removal, a generated unit, another statement of the
   * output):
   * - a `;` when its first token would continue a statement that does not
   *   end with one (`const x = foo` + `(() => 1)()` is a call of `foo`);
   * - a line break when it is a statement of the module and would share the
   *   line of what precedes it (a statement without a `;` before it, a
   *   comment, generated text);
   * - `void` before a string statement the source has after other
   *   statements, when what precedes it in the output is a directive
   *   prologue (its list's start or directives): it would be a directive.
   */
  statementStart(offset: number, from: number, separate: boolean): void {
    const out = this.out
    const first = out.firstTokenChar(from)
    if (first === '') {
      return
    }
    const continues = continuesStatement(first)
    const quote = first === "'" || first === '"'
    if (!continues && !quote) {
      if (
        separate &&
        (offset === -1 || this.startsModuleStatement(offset)) &&
        out.lineOpenAt(from, offset)
      ) {
        out.insert(from, '\n')
      }
      return
    }
    const st = this.statementAt(offset)
    if (st === null) {
      return
    }
    let at = from
    if (
      separate &&
      st.list.type === 'Program' &&
      out.lineOpenAt(from, offset)
    ) {
      out.insert(at++, '\n')
    }
    if (continues) {
      if (out.continuable(from)) {
        out.insert(at, ';')
      }
    } else if (st.node !== null && this.joinsPrologue(st, from)) {
      out.insertAt(at, offset, 'void ')
    }
  }

  /** Whether a statement of the module starts at `offset` (the starts, once per plan). */
  private startsModuleStatement(offset: number): boolean {
    this.moduleStarts ??= new Set(
      this.plan.analysis.file.program.body.map((st) => st.start),
    )
    return this.moduleStarts.has(offset)
  }

  /** The module statement holding `offset` (undefined: none). */
  private moduleStatementAt(offset: number): Node | undefined {
    const body = this.plan.analysis.file.program.body
    let lo = 0
    let hi = body.length - 1
    let at = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (body[mid]!.start <= offset) {
        at = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return at < 0 || offset >= body[at]!.end ? undefined : body[at]
  }

  /** The statement starting at `offset` and its list (-1: a statement of the module); null: no statement of a list starts there. */
  private statementAt(offset: number): ListedStatement | null {
    const program = this.plan.analysis.file.program
    if (offset === -1) {
      return { node: null, list: program, functionBody: false }
    }
    const st = this.moduleStatementAt(offset)
    if (st === undefined) {
      return null
    }
    if (st.start === offset) {
      return { node: st, list: program, functionBody: false }
    }
    return nestedStatementAt(st, offset)
  }

  /**
   * Whether `st`, a string statement of the source that is no directive
   * there, renders where it would join its list's directive prologue: in a
   * module or a function body, after nothing but the list's start and its
   * directives (comments aside).
   */
  private joinsPrologue(st: ListedStatement, from: number): boolean {
    const s = st.node!
    if (
      s.type !== 'ExpressionStatement' ||
      typeof s.directive === 'string' ||
      s.expression.type !== 'Literal' ||
      typeof s.expression.value !== 'string' ||
      (st.list.type !== 'Program' && !st.functionBody)
    ) {
      return false
    }
    // (the prologue: the list's opening `{` or the module's start, after a
    // hashbang, then its directives)
    let end =
      st.list.type === 'Program'
        ? (this.plan.analysis.file.program.hashbang?.end ?? 0)
        : st.list.start + 1
    for (const x of (st.list as unknown as { body: Array<Node> }).body) {
      if (typeof (x as { directive?: unknown }).directive !== 'string') {
        break
      }
      end = x.end
    }
    const last = this.lastTokenBefore(from)
    return last === -1 || (last >= 0 && last < end)
  }

  /** Where the source has the last character of the last token rendered before segment `from`, comments aside (-1: none; -2: generated text). */
  private lastTokenBefore(from: number): number {
    const comments = this.plan.analysis.file.comments
    const segs = this.out.segments
    for (let i = from - 1; i >= 0; i--) {
      const seg = segs[i]!
      if (seg.k === 'text') {
        if (tokenStart(seg.text) < seg.text.length) {
          if (SELF_CHECKS && GENERATED_STRING_STATEMENT.test(seg.text)) {
            // (special case: generated text is never taken for a directive)
            throw internalError(
              `generated text ending with a string precedes a string statement of the source: a directive prologue the statement rule cannot read (${JSON.stringify(seg.text.slice(-40))})`,
            )
          }
          return -2
        }
        continue
      }
      for (let p = seg.end - 1; p >= seg.start; p--) {
        if (isSpace(this.code.charCodeAt(p))) {
          continue
        }
        const c = commentAt(comments, p)
        if (c === undefined) {
          return p
        }
        p = c.start
      }
    }
    return -1
  }

  // ---- pragmas ----

  /**
   * J2.16: a pragma comment the source has after its first statement
   * (`Header.latePragmas`: no pragma for a transform reading leading
   * comments only) must not lead the output once what preceded it is gone:
   * a token keeps it where the source had it. `from`: the first segment
   * after the output's header.
   */
  keepPragmasLate(from: number): void {
    const late = this.plan.analysis.header.latePragmas
    if (late.length === 0 && !SELF_CHECKS) {
      return
    }
    const out = this.out
    const headerEnd = this.plan.analysis.header.end
    for (let i = from; i < out.segments.length; i++) {
      const seg = out.segments[i]!
      if (seg.k === 'text') {
        if (
          SELF_CHECKS &&
          /@jsx(?:ImportSource|Runtime|Frag)?\s/.test(seg.text)
        ) {
          // (special case: the pass reads source slices only)
          throw internalError(
            `generated text holding a JSX pragma renders before the output's first token: a pragma this pass cannot keep late (${JSON.stringify(seg.text.slice(0, 40))})`,
          )
        }
        if (tokenStart(seg.text) < seg.text.length) {
          return
        }
        continue
      }
      const start = Math.max(seg.start, headerEnd)
      if (start >= seg.end) {
        continue
      }
      const token = tokenStart(this.code, start, seg.end)
      const c = late.find((r) => r.start >= start && r.start < token)
      if (c !== undefined) {
        // (before the slice when only whitespace precedes the comment in it)
        out.insertAt(
          i,
          this.code.slice(seg.start, c.start).trim() === ''
            ? seg.start
            : c.start,
          'export {}\n',
        )
        return
      }
      if (token < seg.end) {
        return
      }
    }
  }

  private targetText(to: RefTarget, env: SubstEnv | null): string {
    if ('sym' in to) {
      const sub = env?.get(to.sym)
      return sub ? this.targetText(sub, null) : this.plan.nameOf(to.sym)
    }
    const [root, ...path] = to.member
    const sub = env?.get(root)
    const rootText = sub ? this.targetText(sub, null) : this.plan.nameOf(root)
    return [rootText, ...path].join('.')
  }

  private renderSymRef(
    sym: SymbolId,
    ctx: SymRefContext,
    env: SubstEnv | null,
  ): string {
    const t = this.targetText({ sym }, env)
    return ctx === 'callee' ? calleeText(t) : t
  }

  private renderRefText(
    ctx: RefContext,
    to: RefTarget,
    env: SubstEnv | null,
    exportShorthand: boolean | undefined,
    original: string,
  ): string {
    const t = this.targetText(to, env)
    const isMember = t.includes('.')
    switch (ctx) {
      case 'callee':
        return calleeText(t)
      case 'shorthandProp':
      case 'shorthandPattern':
        return `${original}: ${t}`
      case 'exportSpec':
        if (isMember) {
          throw internalError(
            `cannot export a member expression (${t}) as ${original}`,
          )
        }
        return exportShorthand ? `${t} as ${original}` : t
      case 'declName':
        if (isMember) {
          throw internalError(
            `a declaration name cannot become a member expression (${t})`,
          )
        }
        return t
      default:
        return t
    }
  }
}

/**
 * The shape a boundary rendered: what rendered on its core reported in place
 * of the planned one (under a wrapper, the wrapper's shape with the
 * reference the core reported).
 */
function rendered(b: Boundary, planned: Shape): Shape {
  return b.shape !== -1
    ? b.wrapped
      ? withRef(planned, b.shape)
      : b.shape
    : b.ref !== -1
      ? withRef(planned, b.ref)
      : planned
}

/** The text of a reference rendered as `t` where it is called or tagged (rule V of `expression.ts`, role reference). */
function calleeText(t: string): string {
  return needsValue(
    DEST_CALLEE,
    ROLE_REFERENCE,
    t.includes('.') ? REF_MEMBER : REF_BINDING,
  )
    ? `(0, ${t})`
    : t
}

/**
 * A text ending with a string statement (`SELF_CHECKS`, `lastTokenBefore`):
 * a string literal at a statement's start, ended by `;` or a line end in the
 * same text (a specifier literal, an expression's string are none).
 */
const GENERATED_STRING_STATEMENT =
  /(?:^|[;{}]|[\r\n\u2028\u2029])\s*(?:'(?:[^'\\\r\n]|\\[\s\S])*'|"(?:[^"\\\r\n]|\\[\s\S])*")\s*?(?:;|[\r\n\u2028\u2029])\s*$/

/** The comment holding offset `p` (comments in source order). */
function commentAt(
  comments: ReadonlyArray<{ start: number; end: number }>,
  p: number,
): { start: number; end: number } | undefined {
  let lo = 0
  let hi = comments.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const c = comments[mid]!
    if (p < c.start) {
      hi = mid - 1
    } else if (p >= c.end) {
      lo = mid + 1
    } else {
      return c
    }
  }
  return undefined
}

/**
 * The statement of a statement list inside `statement` (a block's, a
 * static block's, a case's, a namespace body's) that starts at `offset`,
 * with its list: a descent from `statement` through the nodes holding
 * `offset`.
 */
function nestedStatementAt(
  statement: Node,
  offset: number,
): ListedStatement | null {
  let parent: Node | undefined
  let holder: Node | undefined = statement
  while (holder !== undefined) {
    const fields = holder as unknown as Record<string, unknown>
    let inner: Node | undefined
    for (const key of CHILD_KEYS[holder.type] ?? []) {
      const value = fields[key] as Node | ReadonlyArray<Node | null> | null
      inner = Array.isArray(value)
        ? childAt(value, offset)
        : value != null && holds(value as Node, offset)
          ? (value as Node)
          : undefined
      if (inner !== undefined) {
        if (inner.start === offset && isStatementList(holder, key)) {
          return {
            node: inner,
            list: holder,
            functionBody:
              holder.type === 'BlockStatement' &&
              parent !== undefined &&
              (parent.type === 'FunctionDeclaration' ||
                parent.type === 'FunctionExpression' ||
                parent.type === 'ArrowFunctionExpression'),
          }
        }
        break
      }
    }
    parent = holder
    holder = inner
  }
  return null
}

/**
 * The node of a list holding `offset`: a binary search, the list being in
 * source order (a hole, `[, a]`, reads as the node before it).
 */
function childAt(
  list: ReadonlyArray<Node | null>,
  offset: number,
): Node | undefined {
  let lo = 0
  let hi = list.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    let at = mid
    while (at >= lo && list[at] === null) {
      at--
    }
    if (at < lo) {
      lo = mid + 1
      continue
    }
    const child = list[at]!
    if (offset < child.start) {
      hi = at - 1
    } else if (offset >= child.end) {
      lo = mid + 1
    } else {
      return child
    }
  }
  return undefined
}

function holds(node: Node, offset: number): boolean {
  return node.start <= offset && offset < node.end
}

/** Whether `holder[key]` is a statement list (`nestedStatementAt`). */
function isStatementList(holder: Node, key: string): boolean {
  switch (holder.type) {
    case 'BlockStatement':
    case 'StaticBlock':
    case 'TSModuleBlock':
      return key === 'body'
    case 'SwitchCase':
      return key === 'consequent'
    default:
      return false
  }
}

function mergeEnv(
  outer: SubstEnv | null,
  inner: SubstEnv | undefined,
): SubstEnv | null {
  if (!inner || inner.size === 0) {
    return outer
  }
  if (!outer || outer.size === 0) {
    return inner
  }
  const m = new Map(outer)
  for (const [k, v] of inner) {
    m.set(k, v)
  }
  return m
}
