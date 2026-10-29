/**
 * Freezing a resolved plan into the plain-data `EmitPlan`: each output's
 * recipe (the env module with its statement-level dead-code edits, the
 * derived modules' header, glue imports, items and generated units in
 * order, the export glue), its edges and its side-effect flag. `Renderer`
 * applies the render tree, substitution environments and context-aware
 * reference rewrites; no Yuku object is reachable from the result.
 */
import { siblingSpecifier } from './identity'
import { specifierLiteral, stringLiteral } from './strings'
import { statementRecipe } from './units'
import { isLineTerminator, pragmasOf } from './header'
import type { ClassifiedRef, RefContext } from './analysis'
import type {
  AnalysisPlan,
  EdgeForm,
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
  GeneratedUnit,
  OutputId,
  RefTarget,
  RenderTree,
  SubstEnv,
  SymRefContext,
  TreeEdit,
} from './rewrite'
import type { Node } from 'yuku'

export function freezePlan(plan: AnalysisPlan, revision: string): EmitPlan {
  const placement = plan.placement ?? plan.resolve()
  const { analysis } = plan
  const code = analysis.source.code
  const outputs: Record<string, OutputRecipe> = {}
  const edges: Record<string, Array<EdgeRecord>> = {}
  const sideEffects: Record<string, boolean> = {}

  // export names for symbols other outputs import from their home
  const exportNameOf = new Map<OutputId, Map<SymbolId, string>>()
  /** Symbols whose export is glue (not an existing export of the module). */
  const glueExports = new Set<SymbolId>()
  const existingExportName = (sym: SymbolId): string | null => {
    for (const e of analysis.exports) {
      if (e.kind === 'local' && e.local === sym && !e.typeOnly) {
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
          name = plan.names.allocExportName(plan.nameOf(s))
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
    sourceEdges(
      plan,
      id,
      importerId,
      included,
      renderer.tree,
      segments,
      unitsOfImport,
      recipeEdges,
    )
    outputs[id] = {
      kind: decl.kind,
      derivedId: decl.derivedId,
      mapSource: plan.identity.path,
      segments,
    }
    edges[id] = dedupeEdges(recipeEdges)
    // the flag is a property of the content: a cluster with observable
    // effects placed in an opted-in output (it moved with its only needer)
    // keeps it; augmentations of what the output exports do not
    sideEffects[id] =
      decl.sideEffectFree === true &&
      ![...included].some((c) => placement.clusters[c]!.sideEffects)
  }

  return {
    revision,
    sourceLength: code.length,
    outputs,
    edges,
    facts: {
      marker: analysis.markers,
      publishedSummaryDigest: null,
      planners: plan.facts,
    },
    dependencies: [],
    diagnostics: plan.diagnostics.map((d) => ({
      ...d,
      range: d.range ? { ...d.range } : undefined,
    })),
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
  const extra: Array<TreeEdit> = []
  let seq = 2e9
  const baseTree = rewrites.tree('env')
  /** Exported declarators of statements whose `export` keyword a sibling's rename drops. */
  const siblingExports: Array<{ sym: SymbolId; name: string }> = []
  // statement-level DCE edits
  /** The statement rendered before the current one (as the source wrote it, or rewritten). */
  let previous: RenderedStatement | undefined
  for (const item of items) {
    if (baseTree.isErasedAt(item.nodeRange.start)) {
      continue
    }
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
      // exported declarators of the statement stay exported through the
      // same glue
      for (const uid of item.units) {
        const u = units[uid]!
        if (
          !retained.has(uid) ||
          u.exported.length === 0 ||
          u.declares.some((s) => plan.exportedRenames.has(s))
        ) {
          continue
        }
        for (const s of u.declares) {
          for (const name of u.exported) {
            siblingExports.push({ sym: s, name })
          }
        }
      }
    }
    const recipe = statementRecipe(item, units, retained, keepExport, code)
    if (
      recipe !== 'drop' &&
      item.index > 0 &&
      needsLeadingSemicolon(code, item, previous)
    ) {
      extra.push({
        range: { start: item.nodeRange.start, end: item.nodeRange.start },
        body: [{ k: 'text', parts: [';'] }],
        by: 'core:dce',
        seq: seq++,
        claim: null,
      })
    }
    previous = { item, intact: recipe === 'keep' }
    if (recipe === 'keep') {
      continue
    }
    extra.push({
      range: item.range,
      body: recipe === 'drop' ? [] : recipe,
      by: 'core:dce',
      seq: seq++,
      claim: null,
    })
  }
  // generated units homed here, at their anchors
  const anchored = anchoredGenerated(plan, 'env', placement)
  for (const { at, gen } of anchored) {
    extra.push({
      range: { start: at, end: at },
      body: gen.body,
      by: gen.by,
      seq: seq++,
      claim: null,
      gen: gen.id,
    } as TreeEdit)
  }
  // glue imports of the env output (from shared/derived homes) after the header
  const glueImports = glueImportText(
    plan,
    'env',
    placement,
    exportNameOf,
    anchored.map((a) => a.gen),
  )
  if (glueImports.length > 0) {
    extra.push({
      range: { start: analysis.header.end, end: analysis.header.end },
      body: glueImports,
      by: 'core:glue',
      seq: 1.5e9,
      claim: null,
    })
  }
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
  if (exportsText.length > 0) {
    extra.push({
      range: { start: code.length, end: code.length },
      body: exportsText,
      by: 'core:glue',
      seq: seq++,
      claim: null,
    })
  }
  // text appended at the end starts on its own line
  if (code.length > 0 && !isLineTerminator(code.charCodeAt(code.length - 1))) {
    const atEnd = extra
      .filter((e) => e.range.start === code.length && e.body.length > 0)
      .sort((a, b) => a.seq - b.seq)
    const first = atEnd[0]
    if (first) {
      first.body = [{ k: 'text', parts: ['\n'] }, ...first.body]
    }
  }
  const tree = rewrites.tree('env', extra)
  renderer.setTree(tree)
  const out: Array<Segment> = []
  renderer.renderRange(0, code.length, null, null, out, null, true)
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
          return exported === local ? local : `${exported} as ${local}`
        })
      frags.push({
        k: 'text',
        parts: [`import { ${names.join(', ')} } from `],
      })
      frags.push({
        k: 'spec',
        specifier: siblingSpecifier(targetId),
        edgeKey: plan.edgeKey(siblingSpecifier(targetId), 'static', 'runtime'),
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

/** `export { x as name, … } from './file?tsr-split=export~x'` for every extracted cluster. */
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
          parts.push(
            exported === x.name ? exported : `${exported} as ${x.name}`,
          )
        }
      }
    }
    if (parts.length === 0) {
      continue
    }
    frags.push({ k: 'text', parts: [`export { ${parts.join(', ')} } from `] })
    frags.push({
      k: 'spec',
      specifier: siblingSpecifier(decl.derivedId),
      edgeKey: plan.edgeKey(
        siblingSpecifier(decl.derivedId),
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
    for (const [sym, r] of plan.exportedRenames) {
      if (extractedSyms.has(sym)) {
        continue // re-exported from the extracted output under its public names
      }
      const local = 'sym' in r.to ? plan.symbols.name(r.to.sym) : null
      if (local === null) {
        continue
      }
      for (const name of r.names) {
        parts.push(`${local} as ${name}`)
      }
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
  const tree = rewrites.tree(decl.id)
  renderer.setTree(tree)
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
  // header: pragmas and directives (leadingness preserved), never license comments
  const header = analysis.header
  for (const p of header.pragmas) {
    if (!header.license.some((l) => l.start === p.range.start)) {
      if (!out.some((s) => s.k === 'slice' && s.start === p.range.start)) {
        out.push({ k: 'slice', start: p.range.start, end: p.range.end })
        out.push({ k: 'text', text: '\n' })
      }
    }
  }
  const afterPragmas = out.length
  for (const d of header.directives) {
    if (decl.header?.dropDirectives?.includes(d.value)) {
      continue
    }
    out.push({ k: 'slice', start: d.range.start, end: d.range.end })
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
  for (const item of items) {
    const inc = includedUnitsOf(plan, item, included, placement, true)
    if (inc.size === 0) {
      continue
    }
    const recipe = statementRecipe(item, units, inc, false, code)
    if (recipe === 'drop') {
      continue
    }
    pieces.push({
      pos: item.range.start,
      order: 1,
      item,
      intact: recipe === 'keep',
      render: () => {
        if (recipe === 'keep') {
          renderer.renderRange(
            item.range.start,
            item.range.end,
            null,
            null,
            out,
          )
        } else {
          renderer.renderFrags(recipe, null, null, out)
        }
      },
    })
  }
  // in derived outputs, after-header units follow the included import statements
  let importsEnd = -1
  for (const item of items) {
    if (
      item.kind === 'ImportDeclaration' &&
      includedUnitsOf(plan, item, included, placement, true).size > 0
    ) {
      importsEnd = Math.max(importsEnd, item.range.end)
    }
  }
  for (const a of anchored) {
    const pos =
      a.gen.anchor.k === 'after-header'
        ? importsEnd - 0.5
        : a.gen.anchor.k === 'end'
          ? Infinity
          : a.at
    const order =
      a.gen.anchor.k === 'before-unit'
        ? 0
        : a.gen.anchor.k === 'after-unit'
          ? 2
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
    if (p.item !== undefined && needsLeadingSemicolon(code, p.item, previous)) {
      out.push({ k: 'text', text: ';' })
    }
    p.render()
    previous = p
  }
  const exportsText = exportGlue(plan, decl.id, placement, exportNameOf, null)
  renderer.renderFrags(exportsText, null, null, out)
  return out
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

/** The source import edges of an output (every live import, re-export and dynamic edge of the included units). */
function sourceEdges(
  plan: AnalysisPlan,
  output: OutputId,
  importerId: string,
  included: ReadonlySet<number>,
  tree: RenderTree,
  segments: ReadonlyArray<Segment>,
  unitsOfImport: ReadonlyMap<number, ReadonlyArray<Unit>>,
  into: Array<EdgeRecord>,
): void {
  const { analysis, t1 } = plan
  const { units } = t1
  const includedUnit = (u: Unit) => {
    const c = plan.placement!.clusterOfRegion.get(u.region)
    return c !== undefined && included.has(c)
  }
  for (const imp of analysis.imports) {
    if (imp.typeOnly) {
      continue
    }
    const live = (unitsOfImport.get(imp.index) ?? []).filter(
      (u) => u.kind !== 'type' && includedUnit(u),
    )
    if (live.length === 0) {
      continue
    }
    if (tree.isErasedAt(imp.declRange.start)) {
      continue
    }
    const liveLocals = new Set(
      live
        .filter((u) => u.kind === 'import-specifier')
        .flatMap((u) => u.declares),
    )
    const names = analysis.importEdgeNames(
      imp,
      (start) => !tree.isErasedAt(start),
      (spec) => liveLocals.has(spec.local),
    )
    // classic-runtime JSX reads its factory implicitly (no Yuku reference)
    for (const spec of imp.specifiers) {
      if (
        liveLocals.has(spec.local) &&
        !names.includes(spec.imported) &&
        t1.refs
          .refsOf(spec.local)
          .some(
            (r) =>
              r.kind === 'implicitJsxFactory' &&
              !tree.isErasedAt(r.range.start),
          )
      ) {
        names.push(spec.imported)
      }
    }
    const form: EdgeForm = imp.bare ? 'bare' : 'static'
    into.push({
      output,
      importerId,
      edgeKey: plan.edgeKey(imp.specifier, form),
      form,
      kind: names.length > 0 ? 'binding' : 'evaluation',
      specifier: imp.specifier,
      locations: [{ range: imp.specifierRange }],
      typeOnly: false,
      names,
      provenance: { origin: 'source' },
    })
  }
  for (const re of analysis.reexports) {
    if (re.typeOnly || tree.isErasedAt(re.statementRange.start)) {
      continue
    }
    const unit = units.find(
      (u) =>
        u.kind === 'reexport' &&
        u.range.start <= re.statementRange.start &&
        u.range.end >= re.statementRange.end,
    )
    if (!unit || !includedUnit(unit)) {
      continue
    }
    const form: EdgeForm = re.kind === 'star' ? 'star' : 'reexport'
    into.push({
      output,
      importerId,
      edgeKey: plan.edgeKey(re.specifier, form),
      form,
      kind: 'evaluation',
      specifier: re.specifier,
      locations: [{ range: re.specifierRange }],
      typeOnly: false,
      names: re.names,
      provenance: { origin: 'source' },
    })
  }
  for (const dyn of analysis.dynamicEdges) {
    // only where its source text renders: not an output whose code left
    // the call out (another output's code, erased code)
    const { start, end } = dyn.specifierRange
    if (
      !segments.some((s) => s.k === 'slice' && s.start <= start && s.end >= end)
    ) {
      continue
    }
    into.push({
      output,
      importerId,
      edgeKey: plan.edgeKey(dyn.specifier, dyn.form),
      form: dyn.form,
      kind: 'evaluation',
      specifier: dyn.specifier,
      locations: [{ range: dyn.specifierRange }],
      typeOnly: false,
      names: dyn.names,
      provenance: { origin: 'source' },
    })
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
      return node.declare === true && node.id.type === 'Identifier'
    default:
      return false
  }
}

function dedupeEdges(edges: Array<EdgeRecord>): Array<EdgeRecord> {
  const byKey = new Map<string, EdgeRecord>()
  for (const e of edges) {
    const prev = byKey.get(e.edgeKey)
    if (!prev) {
      byKey.set(e.edgeKey, e)
      continue
    }
    prev.locations.push(...e.locations)
    for (const n of e.names) {
      if (!prev.names.includes(n)) {
        prev.names.push(n)
      }
    }
    if (e.kind === 'binding') {
      prev.kind = 'binding'
    }
  }
  return [...byKey.values()]
}

/**
 * Renders ranges and fragments of one output into segments, applying the
 * render tree (edits, placeholders), substitution environments and
 * context-aware reference rewrites.
 */
class Renderer {
  tree!: RenderTree
  private output!: OutputId
  private importerId!: string
  private edges!: Array<EdgeRecord>
  private readonly refByStart = new Map<number, ClassifiedRef>()
  /** Offsets starting a statement whose previous statement of the list has no `;`. */
  private readonly unterminatedBefore = new Map<number, boolean>()

  constructor(
    private readonly plan: AnalysisPlan,
    private readonly code: string,
  ) {
    for (const r of plan.t1.refs.all) {
      if (r.kind !== 'implicitJsxFactory') {
        this.refByStart.set(r.range.start, r)
      }
    }
  }

  begin(output: OutputId, importerId: string, edges: Array<EdgeRecord>): void {
    this.output = output
    this.importerId = importerId
    this.edges = edges
  }

  setTree(tree: RenderTree): void {
    this.tree = tree
  }

  renderRange(
    start: number,
    end: number,
    owner: GeneratedUnit | null,
    env: SubstEnv | null,
    out: Array<Segment>,
    exclude: TreeEdit | null = null,
    includeEnd = false,
    skipZeroWidthAt: number | null = null,
  ): void {
    const cuts: Array<{
      start: number
      end: number
      edit: TreeEdit | null
      ref: ClassifiedRef | null
    }> = []
    for (const e of this.tree.topLevelWithin(
      start,
      end,
      exclude,
      includeEnd,
      skipZeroWidthAt,
    )) {
      cuts.push({ start: e.range.start, end: e.range.end, edit: e, ref: null })
    }
    if (env && env.size > 0) {
      for (const ref of this.plan.t1.refs.refsIn({ start, end })) {
        if (
          !env.has(ref.sym) ||
          ref.kind === 'implicitJsxFactory' ||
          ref.kind === 'exportSpecifier'
        ) {
          continue
        }
        if (
          cuts.some(
            (c) =>
              c.edit !== null &&
              c.start <= ref.range.start &&
              ref.range.start < c.end,
          )
        ) {
          continue
        }
        cuts.push({
          start: ref.range.start,
          end: ref.range.end,
          edit: null,
          ref,
        })
      }
      cuts.sort((a, b) => a.start - b.start || a.end - b.end)
    }
    let pos = start
    for (const cut of cuts) {
      if (cut.start > pos) {
        out.push({ k: 'slice', start: pos, end: cut.start })
      }
      if (cut.edit !== null) {
        const e = cut.edit
        const gen = (e as TreeEdit & { gen?: number }).gen
        const unit =
          gen !== undefined ? this.plan.rewrites.generated[gen]! : owner
        const nextEnv =
          gen !== undefined
            ? mergeEnv(env, this.plan.rewrites.generated[gen]!.env)
            : env
        const at = out.length
        this.renderFrags(
          e.body,
          unit,
          nextEnv,
          out,
          gen !== undefined ? this.plan.rewrites.generated[gen]! : null,
          e,
        )
        this.guardStatementStart(e.range.start, out, at)
      } else {
        const ref = cut.ref!
        const to = env!.get(ref.sym)!
        out.push({
          k: 'text',
          text: this.renderRefText(
            ref.ctx,
            to,
            env,
            ref.exportShorthand,
            this.code.slice(ref.range.start, ref.range.end),
          ),
          mapTo: ref.range.start,
        })
      }
      pos = Math.max(pos, cut.end)
    }
    if (end > pos) {
      out.push({ k: 'slice', start: pos, end })
    }
  }

  renderFrags(
    frags: ReadonlyArray<Frag>,
    owner: GeneratedUnit | null,
    env: SubstEnv | null,
    out: Array<Segment>,
    entering: GeneratedUnit | null = null,
    within: TreeEdit | null = null,
  ): void {
    const unit = entering ?? owner
    const mergedEnv = mergeEnv(env, unit?.env)
    for (const f of frags) {
      switch (f.k) {
        case 'slice': {
          // a claimed region embedded by its owner renders its content, not the placeholder
          let exclude: TreeEdit | null = null
          if (unit) {
            for (const e of this.tree.edits) {
              if (
                e.claim !== null &&
                e.range.start === f.range.start &&
                e.range.end === f.range.end
              ) {
                const claim = this.plan.rewrites.claims.get(e.claim)
                if (claim && claim.owner === unit.id) {
                  exclude = e
                }
                break
              }
            }
          }
          this.renderRange(
            f.range.start,
            f.range.end,
            unit,
            mergedEnv,
            out,
            exclude,
            false,
            within?.range.start ?? null,
          )
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
            output: this.output,
            importerId: this.importerId,
            edgeKey: f.edgeKey,
            form: f.form ?? 'static',
            kind: f.form === 'dynamic' ? 'evaluation' : 'binding',
            specifier: f.specifier,
            locations: [{ segment: out.length - 1 }],
            typeOnly: false,
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
   * list whose previous statement has no `;` and its first token could
   * continue that statement (`const x = foo` + `(() => 1)()` would be a call
   * of `foo`): an edit replacing a call with a parenthesised function, an
   * orphaned initialiser kept as a statement, a placeholder.
   */
  private guardStatementStart(
    offset: number,
    out: Array<Segment>,
    from: number,
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
    let guard = this.unterminatedBefore.get(offset)
    if (guard === undefined) {
      guard = this.unterminatedStatementBefore(offset)
      this.unterminatedBefore.set(offset, guard)
    }
    if (guard) {
      out.splice(from, 0, { k: 'text', text: ';' })
    }
  }

  /** Whether a statement of a statement list starts at `offset` after a statement without `;`. */
  private unterminatedStatementBefore(offset: number): boolean {
    const file = this.plan.analysis.file
    let node = file.nodeAt(offset)
    if (!node || node.start !== offset) {
      return false
    }
    let parent = file.parentOf(node)
    while (parent && parent.start === offset) {
      node = parent
      parent = file.parentOf(node)
    }
    if (!parent) {
      return false
    }
    const list =
      parent.type === 'Program' ||
      parent.type === 'BlockStatement' ||
      parent.type === 'StaticBlock'
        ? parent.body
        : parent.type === 'SwitchCase'
          ? parent.consequent
          : null
    if (!list) {
      return false
    }
    const index = (list as ReadonlyArray<Node>).indexOf(node)
    if (index <= 0) {
      return false
    }
    const prev = (list as ReadonlyArray<Node>)[index - 1]!
    return this.code[prev.end - 1] !== ';'
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
      case 'importLocal':
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
