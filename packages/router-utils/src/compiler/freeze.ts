/**
 * Freezing a resolved plan into the plain-data `EmitPlan`: each output's
 * recipe, put together from pieces (the env module: its source text between
 * the statements placement rewrites, the generated units at their anchors
 * and the glue; the derived modules: header, glue imports, items and
 * generated units in order, the export glue), its edges and its side-effect
 * flag. `Renderer`
 * is the segment visitor of the output's walk (`OutputView.walk`), with
 * substitution environments and context-aware reference rewrites; no Yuku
 * object is reachable from the result.
 */
import { walk } from 'yuku'
import { sameFileSpecifier } from './identity'
import { dedupeEdges, sourceEdges } from './edges'
import { specifierLiteral, specifierName, stringLiteral } from './strings'
import { statementRecipe } from './units'
import { namespaceName } from './source'
import { extendOverTrailingLine, isLineTerminator, pragmasOf } from './header'
import { erases } from './rewrite'
import type { ClassifiedRef, RefContext } from './analysis'
import type { EdgeView } from './edges'
import type {
  AnalysisPlan,
  EdgeRecord,
  EmitPlan,
  OutputRecipe,
  Segment,
} from './plan'
import type { OutputDecl, Placement } from './reach'
import type { SymbolId } from './symbols'
import type { TopLevelItem, Unit, UnitId } from './units'
import type {
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

export function freezePlan(plan: AnalysisPlan, revision: string): EmitPlan {
  const placement = plan.placement ?? plan.resolve()
  const { analysis } = plan
  // two edits of one range that differ in an output, rendered or not
  plan.rewrites.checkConflicts(plan.outputs.keys())
  const code = analysis.source.code
  const outputs: Record<string, OutputRecipe> = {}
  const edges: Record<string, Array<EdgeRecord>> = {}
  const sideEffects: Record<string, boolean> = {}

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
  const extractedOutputs = new Set(placement.extracted.map((e) => e.output))
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
    // an extracted export the core kept in the env module produces no
    // module: a request for it (a stale importer) emits `export {}`
    if (decl.kind === 'export' && !extractedOutputs.has(id)) {
      continue
    }
    const included = placement.included.get(id) ?? new Set()
    const recipeEdges: Array<EdgeRecord> = []
    const importerId = decl.derivedId ?? plan.identity.canonicalId
    renderer.begin(id, importerId, recipeEdges)
    const segments: Array<Segment> =
      id === 'env'
        ? renderEnv(
            plan,
            renderer,
            placement,
            included,
            exportNameOf,
            glueExports,
          )
        : renderDerived(plan, renderer, decl, placement, included, exportNameOf)
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
    }
    edges[id] = dedupeEdges(recipeEdges)
    // the flag is a property of the content: placement moves no cluster
    // with effects into an extracted export's module (the only opted-in
    // outputs); a pure write of what the output exports is no effect
    sideEffects[id] =
      decl.sideEffectFree === true &&
      ![...included].some((c) => placement.clusters[c]!.effectful)
  }

  return {
    revision,
    outputs,
    edges,
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
    sideEffects,
  }
}

function includedUnitsOf(
  plan: AnalysisPlan,
  item: TopLevelItem,
  included: ReadonlySet<number>,
  placement: Placement,
  derived: boolean,
): Set<UnitId> {
  const set = new Set<UnitId>()
  for (const uid of item.units) {
    const u = plan.t1.units[uid]!
    if (u.kind === 'type') {
      // type units stay in the env module (erased by TypeScript) whatever
      // their cluster, except the TypeScript-only specifiers placement
      // dropped (`importStays`); ambient value declarations (`declare
      // enum`, `declare var`, …) are copied: erased by TypeScript, but a
      // TS transform resolves the names through them (Oxc inlines
      // `declare enum` members)
      if (
        derived
          ? isAmbientValueDeclaration(u.node)
          : !placement.droppedTypeUnits.has(uid)
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
 * pieces at one position render in that order: a statement's line end, the
 * glue imports, the generated units, a statement's `;`, the statement; what
 * a planner inserts there renders before them.
 */
function renderEnv(
  plan: AnalysisPlan,
  renderer: Renderer,
  placement: Placement,
  included: ReadonlySet<number>,
  exportNameOf: Map<OutputId, Map<SymbolId, string>>,
  glueExports: ReadonlySet<SymbolId>,
): Array<Segment> {
  const { t1, rewrites, analysis } = plan
  const { items, units } = t1
  const code = analysis.source.code
  const envView = rewrites.view('env')
  const lineEnds: Array<EnvPiece> = []
  /** The `;`s statements need and the statements placement rewrites, in source order. */
  const statements: Array<EnvPiece> = []
  /** The statements placement rewrites (their removals), in source order. */
  const rewritten: Array<EnvPiece> = []
  // a statement only the line break inside the multi-line comment after it
  // ends: that comment leads what follows and may not render, so the statement
  // gets a line end of its own (before anything else generated there)
  const endLine = (statementEnd: number, at: number) => {
    if (
      code.startsWith('/*', at) &&
      code[statementEnd - 1] !== ';' &&
      !isLineTerminator(code.charCodeAt(at - 1))
    ) {
      lineEnds.push({
        start: at,
        end: at,
        body: [{ k: 'text', parts: ['\n'] }],
        gen: null,
      })
    }
  }
  for (const { range } of analysis.header.directives) {
    endLine(range.end, extendOverTrailingLine(code, range.end))
  }
  const anchored = anchoredGenerated(plan, 'env', placement)
  /** Offsets where generated text renders right before what the source wrote. */
  const generatedAt = new Set<number>()
  // generated units homed here, at their anchors (before a statement's `;`)
  const generated: Array<EnvPiece> = []
  for (const { at, gen } of anchored) {
    if (gen.body.length > 0) {
      generatedAt.add(at)
    }
    generated.push({ start: at, end: at, body: gen.body, gen })
  }
  /** Exported declarators of statements whose `export` keyword a sibling's rename drops. */
  const siblingExports: Array<{ sym: SymbolId; name: string }> = []
  /** The statement rendered before the current one (as the source wrote it, or rewritten). */
  let previous: RenderedStatement | undefined
  for (const item of items) {
    if (envView.isErasedAt(item.nodeRange.start)) {
      continue // (its text is a planner's)
    }
    endLine(item.nodeRange.end, item.range.end)
    const retained = includedUnitsOf(plan, item, included, placement, false)
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
    // (a license comment between the statements belongs to neither)
    const afterGenerated =
      generatedAt.size > 0 &&
      (generatedAt.has(item.range.start) ||
        (item.index > 0 && generatedAt.has(items[item.index - 1]!.range.end)))
    if (
      // (a statement placement rewrites starts with its keyword)
      recipe === 'keep' &&
      (item.index > 0 || afterGenerated) &&
      needsLeadingSemicolon(code, item, afterGenerated ? undefined : previous)
    ) {
      statements.push({
        start: item.nodeRange.start,
        end: item.nodeRange.start,
        body: [{ k: 'text', parts: [';'] }],
        gen: null,
      })
    }
    previous = { item, intact: recipe === 'keep' }
    if (recipe !== 'keep') {
      const piece: EnvPiece = {
        start: item.range.start,
        end: item.range.end,
        body: recipe === 'drop' ? [] : recipe,
        gen: null,
      }
      statements.push(piece)
      rewritten.push(piece)
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
  // export glue at the end (re-exports of extracted exports first)
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
  const pieces: Array<EnvPiece> = [...lineEnds]
  if (glueImports.length > 0) {
    const at = analysis.header.end
    pieces.push({ start: at, end: at, body: glueImports, gen: null })
  }
  pieces.push(...generated, ...statements)
  if (exportsText.length > 0) {
    pieces.push({
      start: code.length,
      end: code.length,
      body: exportsText,
      gen: null,
    })
  }
  pieces.sort((x, y) => x.start - y.start)
  // text appended at the end starts on its own line
  if (code.length > 0 && !isLineTerminator(code.charCodeAt(code.length - 1))) {
    const i = pieces.findIndex(
      (p) => p.start === code.length && p.body.length > 0,
    )
    if (i >= 0) {
      pieces[i] = {
        ...pieces[i]!,
        body: [{ k: 'text', parts: ['\n'] }, ...pieces[i]!.body],
      }
    }
  }
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
  const out: Array<Segment> = []
  let pos = 0
  /** The inserts at `pos` rendered with the text before it (a piece followed them). */
  let skipAt: number | null = null
  /** Something other than source text rendered before (the walk's `afterEdit`). */
  let afterEdit = false
  // an insert at the start of a statement placement rewrites is that
  // statement's text (its owner is a unit of it): it renders with what the
  // statement keeps, never with the text before it
  const rewrittenAt = new Set(rewritten.map((p) => p.start))
  for (const p of pieces) {
    afterEdit = renderer.renderSpan(root, pos, p.start, null, null, out, {
      skipAt,
      includeEnd: !rewrittenAt.has(p.start),
      afterEdit,
    })
    renderer.renderPiece(p.start, p.end, p.body, p.gen, out)
    afterEdit = true
    pos = p.end
    skipAt = p.end === p.start ? pos : null
  }
  renderer.renderSpan(root, pos, code.length, null, null, out, {
    skipAt,
    includeEnd: true,
    afterEdit,
  })
  return out
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
      case 'after-unit':
        at = items[units[gen.anchor.unit]!.item]!.range.end
        order = 2
        break
      case 'end':
        at = code.length
        order = 3
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
        provenance: { origin: 'runtime' },
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

/** `export { x as name, … } from '/path/file?tsr-split=export---name'` for every extracted cluster. */
function reexportGlue(
  plan: AnalysisPlan,
  placement: Placement,
  exportNameOf: Map<OutputId, Map<SymbolId, string>>,
): Array<Frag> {
  const frags: Array<Frag> = []
  for (const e of placement.extracted) {
    const decl = plan.outputs.get(e.output)
    if (!decl?.derivedId) {
      continue
    }
    const parts: Array<string> = []
    for (const s of [...e.syms].sort((a, b) => a - b)) {
      const exported = exportNameOf.get(e.output)?.get(s) ?? plan.nameOf(s)
      for (const x of plan.analysis.exports) {
        if (x.kind === 'local' && x.local === s && !x.typeOnly) {
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
      continue
    }
    frags.push({ k: 'text', parts: [`export { ${parts.join(', ')} } from `] })
    frags.push({
      k: 'spec',
      specifier: sameFileSpecifier(decl.derivedId),
      edgeKey: plan.edgeKey(
        sameFileSpecifier(decl.derivedId),
        'reexport',
        'runtime',
      ),
      provenance: { origin: 'runtime' },
    })
    frags.push({ k: 'text', parts: ['\n'] })
  }
  return frags
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
    const extractedSyms = new Set(placement.extracted.flatMap((e) => e.syms))
    for (const [sym, to] of plan.exportedRenames) {
      if (extractedSyms.has(sym)) {
        continue // re-exported from the extracted output under its public names
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
): Array<Segment> {
  const { t1, rewrites, analysis } = plan
  const { items, units } = t1
  const code = analysis.source.code
  const view = rewrites.view(decl.id)
  renderer.setView(view, (offset) => view.isErasedAt(offset))
  const root = rewrites.regions.module
  const out: Array<Segment> = []
  const anchored = anchoredGenerated(plan, decl.id, placement)
  const empty =
    included.size === 0 &&
    anchored.length === 0 &&
    (placement.imports.get(decl.id)?.size ?? 0) === 0
  if (empty) {
    out.push({ k: 'text', text: 'export {}\n' })
    return out
  }
  // header: pragmas and directives (leadingness preserved), never license
  // comments; a comment holding two pragmas renders once
  const header = analysis.header
  let lastPragma = -1
  for (const p of header.pragmas) {
    const { start, end } = p.range
    if (
      start !== lastPragma &&
      !header.license.some((l) => l.start === start)
    ) {
      renderer.renderSpan(root, start, end, null, null, out)
      out.push({ k: 'text', text: '\n' })
    }
    lastPragma = start
  }
  const afterPragmas = out.length
  for (const d of header.directives) {
    if (decl.header?.dropDirectives?.includes(d.value)) {
      continue
    }
    renderer.renderSpan(root, d.range.start, d.range.end, null, null, out)
    out.push({ k: 'text', text: '\n' })
  }
  if (decl.header?.addDirective) {
    out.push({
      k: 'text',
      text: `${specifierLiteral(decl.header.addDirective)}\n`,
    })
  }
  // glue imports
  const glue = glueImportText(
    plan,
    decl.id,
    placement,
    exportNameOf,
    anchored.map((a) => a.gen),
  )
  renderer.renderFrags(glue, null, null, out)
  // pieces in order: generated units by anchor, items by position
  type Piece = Partial<RenderedStatement> & {
    pos: number
    order: number
    render: () => void
  }
  const pieces: Array<Piece> = []
  // in derived outputs, after-header units follow the included import statements
  let importsEnd = -1
  for (const item of items) {
    const inc = includedUnitsOf(plan, item, included, placement, true)
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
      item,
      intact: recipe === 'keep',
      render: () => {
        if (recipe === 'keep') {
          renderer.renderSpan(
            root,
            item.range.start,
            item.range.end,
            null,
            null,
            out,
          )
        } else {
          renderer.renderFrags(recipe, null, null, out, null, {
            level: root,
            skipAt: null,
          })
        }
      },
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
    // before a statement starting where it ends and what is anchored before it;
    // after-unit: before the next statement (its anchor is where that one
    // starts), after what is anchored before it, as in the env module
    const order =
      a.gen.anchor.k === 'after-header'
        ? -1
        : a.gen.anchor.k === 'before-unit'
          ? 0
          : 1
    pieces.push({
      pos,
      order,
      render: () => renderer.renderFrags(a.gen.body, a.gen, null, out),
    })
  }
  pieces.sort((x, y) => x.pos - y.pos || x.order - y.order)
  // leadingness (J2.16): a pragma comment the source wrote after its
  // first statement (ineffective for a transform that reads leading
  // comments only) must not open this output; a token keeps it where the
  // source had it
  const first = pieces[0]
  if (
    out.length === afterPragmas &&
    first?.item !== undefined &&
    startsWithPragmaComment(plan, first.item)
  ) {
    out.push({ k: 'text', text: 'export {}\n' })
  }
  let previous: Piece | undefined
  for (const p of pieces) {
    startLine(out, code)
    if (p.item !== undefined && needsLeadingSemicolon(code, p.item, previous)) {
      out.push({ k: 'text', text: ';' })
    }
    p.render()
    previous = p
  }
  const exportsText = exportGlue(plan, decl.id, placement, exportNameOf, null)
  if (exportsText.length > 0) {
    startLine(out, code)
  }
  renderer.renderFrags(exportsText, null, null, out)
  return out
}

/**
 * What renders next starts on its own line: what a derived output rendered
 * last may be the end of a statement the source ended without a `;`, on the
 * file's end or in a line comment there.
 */
function startLine(out: Array<Segment>, code: string): void {
  const last = out[out.length - 1]
  if (
    last !== undefined &&
    !isLineTerminator(
      last.k === 'slice'
        ? code.charCodeAt(last.end - 1)
        : last.text.charCodeAt(last.text.length - 1),
    )
  ) {
    out.push({ k: 'text', text: '\n' })
  }
}

/** Whether the comments between an item's owned start and its statement carry a JSX pragma. */
function startsWithPragmaComment(
  plan: AnalysisPlan,
  item: TopLevelItem,
): boolean {
  for (const c of plan.analysis.file.comments) {
    if (c.start < item.range.start) {
      continue
    }
    if (c.end > item.nodeRange.start) {
      break
    }
    if (pragmasOf(c).length > 0) {
      return true
    }
  }
  return false
}

/** What of the module renders in `output` (`sourceEdges`): the units it includes, its tree's erasures, its rendered segments. */
function outputView(
  plan: AnalysisPlan,
  included: ReadonlySet<number>,
  erasedAt: (offset: number) => boolean,
  segments: ReadonlyArray<Segment>,
  unitsOfImport: ReadonlyMap<number, ReadonlyArray<Unit>>,
): EdgeView {
  const { units, refs } = plan.t1
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
      const unit = units.find(
        (u) =>
          u.kind === 'reexport' &&
          u.range.start <= range.start &&
          u.range.end >= range.end,
      )
      return unit !== undefined && includedUnit(unit)
    },
    dynamic: ({ start, end }) =>
      segments.some((s) => s.k === 'slice' && s.start <= start && s.end >= end),
    jsxFactory: (local) =>
      refs
        .refsOf(local)
        .some(
          (r) => r.kind === 'implicitJsxFactory' && !erasedAt(r.range.start),
        ),
  }
}

/** `declare enum|namespace|var|let|const|function|class` (an ambient declaration with a value-space name). */
function isAmbientValueDeclaration(node: Node): boolean {
  switch (node.type) {
    case 'TSEnumDeclaration':
    case 'VariableDeclaration':
    case 'ClassDeclaration':
    case 'FunctionDeclaration':
      return node.declare === true
    case 'TSDeclareFunction':
      return node.declare
    case 'TSModuleDeclaration':
      return node.declare === true && namespaceName(node) !== null
    default:
      return false
  }
}

interface SpanOptions extends WalkOptions {
  /** Something other than source text rendered before the span (its source runs are guarded as after an edit). */
  afterEdit?: boolean
}

const NO_SPAN_OPTIONS: SpanOptions = {}

/** Where an edit's body names source text: slices of `level` (the node it rewrites, the module for the core's statement recipes). */
interface SliceLevel {
  level: RangeNode
  /** The inserts there render before the edit (a statement recipe's start). */
  skipAt: number | null
}

/**
 * Renders ranges and fragments of one output into segments: the segment
 * visitor of the output's walk (`OutputView.walk`: source text, active nodes
 * whole, inserts), applying substitution environments and context-aware
 * reference rewrites.
 */
class Renderer {
  view!: OutputView
  erasedAt!: (offset: number) => boolean
  private output!: OutputId
  private importerId!: string
  private edges!: Array<EdgeRecord>
  /** Per statement of the module: the statements of the lists inside it by start, found on first need (`statementStartsIn`). */
  private readonly statementStarts = new Map<
    number,
    Map<number, 'program' | 'nested'>
  >()

  constructor(
    private readonly plan: AnalysisPlan,
    private readonly code: string,
  ) {}

  begin(output: OutputId, importerId: string, edges: Array<EdgeRecord>): void {
    this.output = output
    this.importerId = importerId
    this.edges = edges
  }

  /** What the output renders, and whether an original byte renders in no text of it (`sourceEdges`). */
  setView(view: OutputView, erasedAt: (offset: number) => boolean): void {
    this.view = view
    this.erasedAt = erasedAt
  }

  /** Renders a piece of the env module standing at `start` (`EnvPiece`). */
  renderPiece(
    start: number,
    end: number,
    body: ReadonlyArray<Frag | GenFrag>,
    gen: GeneratedUnit | null,
    out: Array<Segment>,
  ): void {
    const from = out.length
    this.renderFrags(
      body,
      gen,
      null,
      out,
      null,
      end > start
        ? { level: this.plan.rewrites.regions.module, skipAt: start }
        : null,
    )
    this.guardStatementStart(start, out, from)
  }

  // ---- the span being rendered (`renderSpan`; saved around a nested one) ----
  private spanOwner: GeneratedUnit | null = null
  private spanEnv: SubstEnv | null = null
  private spanOut: Array<Segment> = []
  /** The references the substitution environment rewrites in the span's source (one inside an active node renders with it). */
  private spanSubst: Array<ClassifiedRef> | null = null
  private spanSi = 0
  /**
   * The source text after an edit: the statement it starts may follow what
   * the edit left (a removed `const local = 1;` before `(mk)()`).
   */
  private spanAfterEdit = false
  /** The segment visitor of the walk, one per renderer (its state is the span's). */
  private readonly spanVisitor: WalkVisitor = {
    source: (s, e) => {
      const subst = this.spanSubst
      let pos = s
      if (subst !== null) {
        const env = this.spanEnv!
        const out = this.spanOut
        while (
          this.spanSi < subst.length &&
          subst[this.spanSi]!.range.start < s
        ) {
          this.spanSi++ // (inside an active node)
        }
        while (
          this.spanSi < subst.length &&
          subst[this.spanSi]!.range.start < e
        ) {
          const ref = subst[this.spanSi++]!
          if (ref.range.start > pos) {
            this.copy(pos, ref.range.start)
          }
          this.spanAfterEdit = false
          const at = out.length
          out.push({
            k: 'text',
            text: this.renderRefText(
              ref.ctx,
              env.get(ref.sym)!,
              env,
              ref.exportShorthand,
              this.code.slice(ref.range.start, ref.range.end),
            ),
            mapTo: ref.range.start,
          })
          // a callee at a statement's start renders `(0, props.x)`: as an edit
          this.guardStatementStart(ref.range.start, out, at)
          pos = Math.max(pos, ref.range.end)
        }
      }
      if (e > pos) {
        this.copy(pos, e)
      }
    },
    node: (n) => {
      this.spanAfterEdit = true
      const out = this.spanOut
      const at = out.length
      this.renderFrags(
        (this.view.placeOf(n) ?? this.view.textOf(n))!,
        this.spanOwner,
        this.spanEnv,
        out,
        null,
        { level: n, skipAt: null },
      )
      this.guardStatementStart(n.start, out, at)
    },
    insert: (e) => {
      this.spanAfterEdit = true
      const out = this.spanOut
      const at = out.length
      this.renderFrags(e.body, this.spanOwner, this.spanEnv, out)
      this.guardStatementStart(e.range.start, out, at)
    },
  }

  /**
   * Renders `[start, end)` of `level`'s text (`OutputView.walk`); returns
   * whether something other than source text rendered (`afterEdit`, given:
   * before it).
   */
  renderSpan(
    level: RangeNode,
    start: number,
    end: number,
    owner: GeneratedUnit | null,
    env: SubstEnv | null,
    out: Array<Segment>,
    opts: SpanOptions = NO_SPAN_OPTIONS,
  ): boolean {
    let subst: Array<ClassifiedRef> | null = null
    if (env && env.size > 0) {
      subst = []
      for (const ref of this.plan.t1.refs.refsIn({ start, end })) {
        if (
          env.has(ref.sym) &&
          ref.kind !== 'implicitJsxFactory' &&
          ref.kind !== 'exportSpecifier'
        ) {
          subst.push(ref)
        }
      }
    }
    // (a span renders spans inside it, through the bodies it renders)
    const outerOwner = this.spanOwner
    const outerEnv = this.spanEnv
    const outerOut = this.spanOut
    const outerSubst = this.spanSubst
    const outerSi = this.spanSi
    const outerAfterEdit = this.spanAfterEdit
    this.spanOwner = owner
    this.spanEnv = env
    this.spanOut = out
    this.spanSubst = subst
    this.spanSi = 0
    this.spanAfterEdit = opts.afterEdit === true
    this.view.walk(level, start, end, this.spanVisitor, opts)
    const afterEdit = this.spanAfterEdit
    this.spanOwner = outerOwner
    this.spanEnv = outerEnv
    this.spanOut = outerOut
    this.spanSubst = outerSubst
    this.spanSi = outerSi
    this.spanAfterEdit = outerAfterEdit
    return afterEdit
  }

  /** Copies source text of the span (after an edit, a statement it starts is guarded). */
  private copy(pos: number, to: number): void {
    const out = this.spanOut
    if (!this.spanAfterEdit) {
      out.push({ k: 'slice', start: pos, end: to })
      return
    }
    // a `;` goes after the indentation, before a comment (an annotation
    // stays with its call)
    let from = pos
    while (from < to && /\s/.test(this.code[from]!)) {
      from++
    }
    if (from > pos) {
      out.push({ k: 'slice', start: pos, end: from })
    }
    const at = out.length
    out.push({ k: 'slice', start: from, end: to })
    // (a statement of the module's own list has freeze's guard)
    this.guardStatementStart(this.tokenStart(from, to), out, at, true)
  }

  /** Where the first token of the source between `start` and `end` starts (`end` when there is none). */
  private tokenStart(start: number, end: number): number {
    const m = /^(?:\s|\/\*[\s\S]*?\*\/|\/\/.*)*/.exec(
      this.code.slice(start, end),
    )
    return start + m![0].length
  }

  /**
   * Renders fragments: `slices` says where the body's slices are (none in a
   * generated unit, which names source text as the regions it claims).
   */
  renderFrags(
    frags: ReadonlyArray<Frag | GenFrag>,
    owner: GeneratedUnit | null,
    env: SubstEnv | null,
    out: Array<Segment>,
    entering: GeneratedUnit | null = null,
    slices: SliceLevel | null = null,
  ): void {
    const unit = entering ?? owner
    const mergedEnv = mergeEnv(env, unit?.env)
    for (const f of frags) {
      switch (f.k) {
        case 'slice': {
          const level = slices?.level
          if (
            level === undefined ||
            f.range.start < level.start ||
            f.range.end > level.end
          ) {
            throw new Error(
              `conflict: a body copies [${f.range.start}, ${f.range.end}), outside the text it rewrites${level ? ` [${level.start}, ${level.end})` : ''}`,
            )
          }
          this.renderSpan(
            level,
            f.range.start,
            f.range.end,
            unit,
            mergedEnv,
            out,
            slices!.skipAt === null
              ? NO_SPAN_OPTIONS
              : { skipAt: slices!.skipAt },
          )
          break
        }
        case 'region': {
          // a claimed region, rendered by its owner: its text
          const claim = this.plan.rewrites.claims.get(f.id)
          if (claim === undefined || unit === null || claim.owner !== unit.id) {
            throw new Error(
              `conflict: a generated unit renders region ${f.id}, which it does not claim`,
            )
          }
          const node = this.plan.rewrites.regions.nodeOn(
            this.plan.regions.get(f.id).range,
          )!
          if (!this.view.isClaimed(node) && !this.view.isErasedAround(node)) {
            // (claimed for other outputs: its text stands at its place here)
            throw new Error(
              `conflict: region ${f.id} renders in its owner and at its place in ${this.view.output}`,
            )
          }
          const text = this.view.textOf(node)
          if (text === null) {
            this.renderSpan(node, node.start, node.end, unit, mergedEnv, out)
          } else {
            const at = out.length
            this.renderFrags(text, unit, mergedEnv, out, null, {
              level: node,
              skipAt: null,
            })
            this.guardStatementStart(node.start, out, at)
          }
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
              f.mapTo !== undefined
                ? { k: 'text', text, mapTo: f.mapTo }
                : { k: 'text', text },
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
            names: [...(f.names ?? [])],
            provenance: f.provenance ?? { origin: 'runtime' },
          })
          break
        }
        case 'ref': {
          out.push({
            k: 'text',
            text: this.renderRefText(
              f.ctx,
              f.to,
              mergedEnv,
              f.exportShorthand,
              this.code.slice(f.range.start, f.range.end),
            ),
            mapTo: f.range.start,
          })
          break
        }
      }
    }
  }

  /**
   * A `;` before text rendered at `offset` when it starts a statement of a
   * list, what renders before it does not end with a `;` and its first token
   * could continue that (`const x = foo` + `(() => 1)()` would be a call of
   * `foo`): an edit replacing a call with a parenthesised function, an orphaned
   * initialiser kept as a statement, a placeholder, or the source statement
   * after an edit that removed the one before it (`let y = foo`, removed
   * `const local = 1;`, `(mk)()`). What renders before it may be generated, or
   * the statement before the one the source wrote there.
   */
  private guardStatementStart(
    offset: number,
    out: Array<Segment>,
    from: number,
    nestedOnly = false,
  ): void {
    let first = ''
    for (let i = from; i < out.length && first === ''; i++) {
      const seg = out[i]!
      const text =
        seg.k === 'slice' ? this.code.slice(seg.start, seg.end) : seg.text
      // the first token's first character: a comment (`/* @__PURE__ */`) is no `/`
      const m = /^(?:\s|\/\*[\s\S]*?\*\/|\/\/.*)*(\S)/.exec(text)
      if (m) {
        first = m[1]!
      }
    }
    if (first === '' || !'([`+-/<'.includes(first)) {
      return
    }
    const list = this.statementListAt(offset)
    if (
      list !== undefined &&
      (list === 'nested' || !nestedOnly) &&
      this.continuable(out, from)
    ) {
      out.splice(from, 0, { k: 'text', text: ';' })
    }
  }

  /** The statement list a statement starting at `offset` stands in: the module's (`program`), a nested one, or none. */
  private statementListAt(offset: number): 'program' | 'nested' | undefined {
    const program = this.plan.analysis.file.program
    const body = program.body
    // (the module's statement holding `offset`)
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
    if (at < 0 || offset >= body[at]!.end) {
      return undefined
    }
    const st = body[at]!
    if (st.start === offset) {
      // (the module's first statement: nothing renders before it)
      return offset === program.start ? undefined : 'program'
    }
    let starts = this.statementStarts.get(at)
    if (starts === undefined) {
      starts = statementStartsIn(st)
      this.statementStarts.set(at, starts)
    }
    return starts.get(offset)
  }

  /**
   * Whether the text before segment `from` ends with something a next token
   * could continue: anything but a `;` or a block's start (taken for a comment's
   * end when its line holds a `//`: another `;` costs nothing).
   */
  private continuable(out: ReadonlyArray<Segment>, from: number): boolean {
    for (let i = from - 1; i >= 0; i--) {
      const seg = out[i]!
      const text = (
        seg.k === 'slice' ? this.code.slice(seg.start, seg.end) : seg.text
      ).trimEnd()
      if (text !== '') {
        const last = text[text.length - 1]!
        return (
          (last !== ';' && last !== '{') ||
          text.slice(text.lastIndexOf('\n') + 1).includes('//')
        )
      }
    }
    return false
  }

  /** The id of the module the current output takes `sym` from: the home it imports it from, else its own. */
  private homeIdOf(sym: SymbolId): string {
    for (const [home, syms] of this.plan.placement?.imports.get(this.output) ??
      []) {
      if (syms.has(sym)) {
        return (
          this.plan.outputs.get(home)?.derivedId ??
          this.plan.identity.canonicalId
        )
      }
    }
    return this.importerId
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
    if (ctx === 'homeId') {
      return stringLiteral(this.homeIdOf(sym), '"')
    }
    const t = this.targetText({ sym }, env)
    if (ctx === 'callee' && t.includes('.')) {
      return `(0, ${t})`
    }
    return t
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
        return isMember ? `(0, ${t})` : t
      case 'shorthandProp':
      case 'shorthandPattern':
        return `${original}: ${t}`
      case 'exportSpec':
        if (isMember) {
          throw new Error(
            `cannot export a member expression (${t}) as ${original}`,
          )
        }
        return exportShorthand ? `${t} as ${original}` : t
      case 'declName':
        if (isMember) {
          throw new Error(
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
 * The statements of the statement lists inside one statement of the module,
 * by start (`nested`: a block's, a static block's, a case's). One walk of
 * that statement.
 */
function statementStartsIn(statement: Node): Map<number, 'nested'> {
  const out = new Map<number, 'nested'>()
  const add = (holder: Node, list: ReadonlyArray<Node>) => {
    for (const st of list) {
      if (st.start !== holder.start) {
        out.set(st.start, 'nested')
      }
    }
  }
  walk(statement, {
    enter: (n) => {
      switch (n.type) {
        case 'BlockStatement':
        case 'StaticBlock':
          add(n, n.body)
          break
        case 'SwitchCase':
          add(n, n.consequent)
          break
      }
    },
  })
  return out
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

/** A statement an output rendered: as the source wrote it (`intact`, with the `;` that may end it) or rewritten. */
interface RenderedStatement {
  item: TopLevelItem
  intact: boolean
}

/**
 * Whether a statement gets a `;` of its own: its first token would continue
 * a statement before it that has no `;` (a parenthesis, a bracket, a
 * template, a sign, a regular expression, JSX or a type assertion), and what
 * renders before it is not its intact source predecessor, which ended with
 * the `;` it relies on (semicolon-free code writes `;(x as any).y = 1`).
 */
function needsLeadingSemicolon(
  code: string,
  item: TopLevelItem,
  previous: Partial<RenderedStatement> | undefined,
): boolean {
  return (
    '([`+-/<'.includes(code[item.nodeRange.start]!) &&
    !(previous?.intact && previous.item?.index === item.index - 1)
  )
}
