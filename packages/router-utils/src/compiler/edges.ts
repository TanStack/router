/**
 * The source import edges of an output (J6): one builder for a planned
 * output (Tier 1: what the output renders) and for a module no Tier 1
 * planner rewrites (Tier 0: its env output is its source). One record per
 * logical edge (`dedupeEdges`): an import statement repeated, or glue
 * standing in for a user import, adds locations and names to it.
 */
import type { ImportEntry, ModuleAnalysis } from './analysis'
import type { EdgeForm, EdgeRecord } from './plan'
import type { SymbolId } from './symbols'

/** What of the module's source renders in an output. */
export interface EdgeView {
  /** The value specifiers of an import statement the output renders (by local), or null when it renders none of it. */
  importLocals: (imp: ImportEntry) => ReadonlySet<SymbolId> | null
  /** Whether source text at `offset` is erased in the output. */
  erasedAt: (offset: number) => boolean
  /** Whether a re-export statement renders. */
  reexports: (statementRange: { start: number; end: number }) => boolean
  /** Whether a dynamic import's specifier renders. */
  dynamic: (specifierRange: { start: number; end: number }) => boolean
  /** Whether the output's JSX reads `local` as its implicit factory. */
  jsxFactory: (local: SymbolId) => boolean
}

/** The module as written: every statement renders. */
export function wholeModule(analysis: ModuleAnalysis): EdgeView {
  return {
    importLocals: (imp) =>
      new Set(imp.specifiers.flatMap((s) => (s.typeOnly ? [] : [s.local]))),
    erasedAt: () => false,
    reexports: () => true,
    dynamic: () => true,
    jsxFactory: (local) => analysis.implicitJsxReads().has(local),
  }
}

/** The source import edges of an output (every rendered import, re-export and dynamic edge). */
export function sourceEdges(
  analysis: ModuleAnalysis,
  edgeKey: (rawSpecifier: string, form: EdgeForm) => string,
  importerId: string,
  view: EdgeView,
): Array<EdgeRecord> {
  const into: Array<EdgeRecord> = []
  const edge = (
    specifier: string,
    form: EdgeForm,
    kind: EdgeRecord['kind'],
    range: { start: number; end: number },
    names: Array<string>,
  ) => {
    into.push({
      importerId,
      edgeKey: edgeKey(specifier, form),
      form,
      kind,
      specifier,
      locations: [{ range }],
      typeOnly: false,
      names,
      provenance: { origin: 'source' },
    })
  }
  for (const imp of analysis.imports) {
    if (imp.typeOnly) {
      continue
    }
    const locals = view.importLocals(imp)
    if (locals === null || view.erasedAt(imp.declRange.start)) {
      continue
    }
    // binding edge iff a specifier is used as a value (an import whose
    // bindings are unused, or only used as types, is an evaluation edge)
    const names = analysis.importEdgeNames(
      imp,
      (start) => !view.erasedAt(start),
      (spec) => locals.has(spec.local),
    )
    // classic-runtime JSX reads its factory implicitly (no Yuku reference)
    for (const spec of imp.specifiers) {
      if (
        locals.has(spec.local) &&
        !names.includes(spec.imported) &&
        view.jsxFactory(spec.local)
      ) {
        names.push(spec.imported)
      }
    }
    edge(
      imp.specifier,
      imp.bare ? 'bare' : 'static',
      names.length > 0 ? 'binding' : 'evaluation',
      imp.specifierRange,
      names,
    )
  }
  for (const re of analysis.reexports) {
    if (
      re.typeOnly ||
      view.erasedAt(re.statementRange.start) ||
      !view.reexports(re.statementRange)
    ) {
      continue
    }
    edge(
      re.specifier,
      re.kind === 'star' ? 'star' : 'reexport',
      'evaluation',
      re.specifierRange,
      re.names,
    )
  }
  for (const dyn of analysis.dynamicEdges) {
    // only where its source text renders: not an output whose code left
    // the call out (another output's code, erased code)
    if (view.dynamic(dyn.specifierRange)) {
      edge(dyn.specifier, dyn.form, 'evaluation', dyn.specifierRange, dyn.names)
    }
  }
  return into
}

/**
 * One record per edge key: the locations and names of every record of the
 * key, `binding` when any is, a binding record's locations first (a report
 * points at an import that reads the binding, not at one TypeScript erases).
 */
export function dedupeEdges(edges: Array<EdgeRecord>): Array<EdgeRecord> {
  const byKey = new Map<string, EdgeRecord>()
  for (const e of edges) {
    const prev = byKey.get(e.edgeKey)
    if (!prev) {
      byKey.set(e.edgeKey, e)
      continue
    }
    if (e.kind === 'binding' && prev.kind !== 'binding') {
      prev.locations.unshift(...e.locations)
      prev.kind = 'binding'
    } else {
      prev.locations.push(...e.locations)
    }
    for (const n of e.names) {
      if (!prev.names.includes(n)) {
        prev.names.push(n)
      }
    }
  }
  return [...byKey.values()]
}
