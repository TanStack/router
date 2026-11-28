/**
 * A violation as the `import-edges` planner records it (plain data: plan
 * facts, Rspack `buildInfo`), as `onViolation` receives it (`ViolationInfo`,
 * J6.5) and as `allowImport` is asked about it (`AllowImportInfo`).
 */
import { ASSET_QUERY_RE, identify } from '@tanstack/router-utils/compiler'
import { edgeModuleKey } from './edge-modules'
import { cutTrace } from './graph-trace'
import { patternOf, relativeTargetPath, rulesFor } from './rules'
import type { EdgeModuleContent } from './edge-modules'
import type { ImportProtectionConfig } from './config'
import type { EnvType, RuleRef } from './rules'
import type { CodeFrame, OriginalLocation } from './locate'
import type { IndexedEdge, Trace } from './graph-trace'
import type { PatternImport } from './pattern-imports'
import type { AllowImportInfo, TraceStep, ViolationInfo } from './trace'
import type { PlanFacts } from '@tanstack/router-utils/compiler'

export const IMPORT_EDGES_PLANNER = 'import-edges'

export interface EdgeViolation {
  /** The logical edge (one per user dependency). */
  edgeKey: string
  env: string
  envType: EnvType
  rule: RuleRef
  /** The specifier as the importer wrote it. */
  specifier: string
  /** Absolute path of the importing file. */
  importer: string
  /** The bundler module id of the output that imports it (trace start). */
  importerId: string
  /** The target's canonical id, when it resolved. */
  resolved: string | null
  /** Where the import is, in the original source. */
  loc: OriginalLocation | null
  /** The original source around `loc`, when the original text is known. */
  snippet: CodeFrame | null
  behavior: 'error' | 'mock'
  /** The edge module the specifier was substituted with. */
  module: { key: string; content: EdgeModuleContent }
  /**
   * Dev: the bundler's TypeScript transform may erase the import; nothing is
   * decided or reported until the bundler requests the edge module
   * (`ImportProtectionEnv.confirm`).
   */
  pending?: true
  /**
   * The module's own violation: denied where it is compiled, so an import the
   * compiler does not read brought it there (`import.meta.glob`, a template
   * literal `import()`): `importer` is the module itself, `module` its mock.
   */
  self?: true
  /**
   * An RSC app's server environment, a module that is its own violation
   * (`self`, and the build's importer violations it stands for): its parsed
   * prologue has the `'use client'` directive, so SSR renders it as a client
   * component a server component renders (the report's fixes).
   */
  useClient?: true
  /**
   * Server environment: the importer renders a binding of the import as a
   * component (a JSX element, a route's `component` option), so the fix is
   * `<ClientOnly>`, never `createClientOnlyFn` (it throws while rendering on
   * the server). `at`: the first such use, in the original source.
   */
  rendered?: RenderedUse
  /**
   * Server environment, a Vue SFC importer: the import's binding (a
   * template's component is no JSX the compiler can see), and the export it
   * imports (`'default'` for a default import).
   */
  binding?: { name: string; imported: string }
  /**
   * A client-reference handoff: the import of a `'use client'` file in an
   * environment that renders server components, which the bundler turns
   * into client references (nothing of the file runs there). The file's
   * module comes to the environment that renders client references on the
   * server (`clientReferencesInto`): this import is how it does, and
   * `allowImport`'s answer on it is what that module gets. Never
   * substituted (`module` is its ledger key, no edge module of ours).
   */
  handoff?: true
  /** The edge is a re-export (`export … from`): a barrel passes the module on. */
  reexport?: true
  /** A declaration of the edge has only `type` specifiers (a host's TypeScript may keep it bare: its mock runs; the suggestion is `import type`). */
  typeSpecifiers?: true
  /** The import of a marker by the module it marks (an entry's: its own violation, whatever its form or the host's transform makes of it). */
  ownMarker?: true
  /** Build: one importer's import of a module that is its own violation, by the pattern import found in its text. */
  pattern?: PatternImport | null
}

/** How an importer renders an import as a component (`EdgeViolation.rendered`). */
export interface RenderedUse {
  /** The binding as the importer names it: the expression's source text (`UI.Chart`, `Screens?.['chart']`). */
  name: string
  /** `jsx`: `<Name …>`; `option`: a route option such as `component: Name`. */
  via: 'jsx' | 'option'
  /** The option's key (`via: 'option'`). */
  key?: string
  /**
   * A free module-level name to bind the option's value to first, when
   * `name` is no JSX tag of a component (a lowercase identifier names an
   * intrinsic element; a computed member or an optional chain is no tag).
   */
  alias?: string
  at: OriginalLocation | null
}

/** The edge key of a module's own violation (`EdgeViolation.self`) in an environment. */
function selfEdgeKey(canonicalId: string): string {
  return `self\u0000${canonicalId}`
}

/** A module's own violation (`EdgeViolation.self`), its mock describing the module (`target`). */
export function selfViolationOf(
  config: ImportProtectionConfig,
  env: { name: string; type: EnvType },
  id: string,
  rule: RuleRef,
  target: {
    names: Array<string>
    hasDefault: boolean
  },
): EdgeViolation {
  const file = relativeTargetPath(config, id)
  const edgeKey = selfEdgeKey(id)
  // an asset query tells how it was imported (`x.server.ts?raw`)
  const specifier = ASSET_QUERY_RE.test(id)
    ? `${file}${id.slice(id.indexOf('?'))}`
    : file
  const content: EdgeModuleContent = {
    env: env.name,
    edgeKey,
    specifier,
    importer: '',
    file,
    names: target.names.sort(),
    resolved: id,
    hasDefault: target.hasDefault,
    bare: false,
    // (its importers are imports the compiler does not read: a package
    // module, another plugin's; its mock keeps them evaluated as the real
    // file would, under the package's own `sideEffects`)
    evaluated: true,
    rule,
  }
  return {
    edgeKey,
    env: env.name,
    envType: env.type,
    rule,
    specifier,
    importer: identify(id).path,
    importerId: id,
    resolved: id,
    loc: null,
    snippet: null,
    behavior: config.behavior,
    module: { key: edgeModuleKey(content), content },
    self: true,
  }
}

/** What the planner stores in `plan.facts.planners['import-edges']`. */
export interface ImportEdgesFacts {
  /** Violations by output id (only outputs that have some). */
  violations: Record<string, Array<EdgeViolation>>
  /**
   * The resolved edges the policy judged, by output id (each output's
   * importer id is its own): what a compile of the output gives the edge
   * index (`ImportProtectionEnv.commit`, its one writer), a cached
   * plan's compile as a fresh one's.
   */
  edges?: Record<string, Array<IndexedEdge>>
  /** The revision of the input the edges were judged in. */
  revision?: string
  /** The module's `env` output is client references here (`ImportEdgesConfig.clientReferences`, a `'use client'` module). */
  clientReferences?: true
}

/** The resolved edges of one compiled output and the revision they were judged in; null when the policy judged none of it. */
export function judgedEdgesOf(output: {
  facts: Pick<PlanFacts, 'planners'>
  output: string
}): { edges: Array<IndexedEdge>; revision: string | null } | null {
  const facts = output.facts.planners[IMPORT_EDGES_PLANNER]
  const edges = facts?.edges?.[output.output]
  return edges ? { edges, revision: facts.revision ?? null } : null
}

/** Whether a compiled output is client references in its environment (`ImportEdgesFacts.clientReferences`). */
export function clientReferencesOf(output: {
  facts: Pick<PlanFacts, 'planners'>
  output: string
}): boolean {
  return (
    output.output === 'env' &&
    output.facts.planners[IMPORT_EDGES_PLANNER]?.clientReferences === true
  )
}

/** The violations of one compiled output (`CompileOutput.facts`, `CompileOutput.output`). */
export function violationsOf(output: {
  facts: Pick<PlanFacts, 'planners'>
  output: string
}): Array<EdgeViolation> {
  const facts = output.facts.planners[IMPORT_EDGES_PLANNER]
  return facts?.violations[output.output] ?? []
}

/**
 * `log: 'once'` and `allowImport`'s memo dedupe by this key: the logical
 * edge's provenance (the environment name reports give, `env`; importer,
 * raw specifier, target). It is the contract's unit, one import: two
 * declarations of one specifier in a file, or a static and a dynamic import
 * of it, are one question, asked at the first (its `loc`).
 */
export function dedupeKey(v: EdgeViolation, env = v.env): string {
  return [env, v.importer, v.specifier, v.resolved ?? ''].join('\u0000')
}

/**
 * What `allowImport` is told of a violation: all that is known of the import
 * before the bundler's graph is finished, so no `trace` (no chain exists yet)
 * and no `snippet` (a rendering of the source for a report, nothing a decision
 * reads). `env`: the name reports give the environment (default: its key).
 */
export function allowImportInfo(
  v: EdgeViolation,
  config: ImportProtectionConfig,
  env = v.env,
): AllowImportInfo {
  const pattern = patternOf(rulesFor(config, v.envType), v.rule)
  return {
    env,
    envType: v.envType,
    type: v.rule.type,
    behavior: v.behavior,
    ...(pattern !== undefined && { pattern }),
    specifier: v.specifier,
    importer: v.importer,
    ...(v.loc && { importerLoc: { ...v.loc } }),
    ...(v.resolved !== null && { resolved: identify(v.resolved).path }),
  }
}

/** A violation's `ViolationInfo`, with the whole trace a report prints (`freezeTrace`). */
export type ReportedInfo = ViolationInfo & {
  /** Reads the trace from the graph as it is now, once: later reads (and `trace`) see the same steps. */
  freezeTrace: () => Trace
}

/**
 * The `ViolationInfo` of a violation. `trace`: the trace itself (a build
 * walks its finished graph once, for `onViolation` and the report alike), or
 * a reader called when the trace is first read (dev: the graph may not know
 * the importer's importers yet when `onViolation` runs; a report reads it
 * when printed), dropped after that read. The trace is cut at
 * `maxTraceDepth` and stays what it was then: an event kept after a later
 * edit still names the chain that brought the import, and an event kept
 * after a build holds no part of that build. `env`: the name reports give
 * the environment (default: its key).
 */
export function violationInfo(
  v: EdgeViolation,
  config: ImportProtectionConfig,
  trace: Trace | (() => Trace),
  env = v.env,
): ReportedInfo {
  let frozen: Trace | null = null
  let source: Trace | (() => Trace) | null = trace
  const freeze = (): Trace => {
    if (frozen) {
      return frozen
    }
    // (a trace given as a value may be given to other infos too: each
    // freezes its own steps, `info.trace` is the user's to change)
    const read = typeof source === 'function' ? source() : source!
    source = null
    const t = (frozen = {
      fromEntry: read.fromEntry,
      steps: read.steps.map((step) => ({ ...step })),
    })
    const last = t.steps[t.steps.length - 1]
    if (last && identify(last.file).path === v.importer) {
      last.specifier = v.specifier
      if (v.loc && v.loc.file === v.importer) {
        last.line = v.loc.line
        last.column = v.loc.column
      }
    }
    return t
  }
  const info = {
    ...allowImportInfo(v, config, env),
    ...(v.snippet && {
      snippet: { ...v.snippet, lines: [...v.snippet.lines] },
    }),
  } as ReportedInfo
  Object.defineProperty(info, 'trace', {
    enumerable: true,
    configurable: true,
    get: (): Array<TraceStep> => cutTrace(freeze().steps, config.maxTraceDepth),
  })
  Object.defineProperty(info, 'freezeTrace', {
    enumerable: false,
    value: freeze,
  })
  return info
}

/** The `buildInfo` key of the import-protection records of a module (Rspack persistent cache). */
export const RSPACK_BUILD_INFO_KEY = 'tanstack.start.ip'

/**
 * The version of `RspackImportProtectionBuildInfo`. A module restored with a
 * record of another version (a persistent cache an earlier build wrote) is
 * built again, never replayed. 2: every violation has its edge module. 3:
 * edge keys and edge-module ids of compile environments (no layer; an
 * Rspack RSC layer's module records the `rsc` environment's). 4: the
 * client-reference handoff (`EdgeViolation.handoff`, `clientReferences`).
 * 5: no effect reading. 6: one `EdgeModuleContent.evaluated` (no `runs`).
 * 7: `evaluated` per declaration (`export {} from`, a type-only import next
 * to a value one). 8: `typeSpecifiers` for any all-type declaration.
 */
export const RSPACK_BUILD_INFO_VERSION = 8

/**
 * What the Rspack loader stores in an importer's `buildInfo[RSPACK_BUILD_INFO_KEY]`
 * (plain JSON, restored with the module by the persistent cache) and what
 * `finishMake` replays into the environment (`ImportProtectionEnv.replay`).
 */
export interface RspackImportProtectionBuildInfo {
  version: typeof RSPACK_BUILD_INFO_VERSION
  env: string
  /** The violations of this module's output (with their edge modules). */
  violations: Array<EdgeViolation>
  /** The module's resolved edges (the trace steps through a restored module). */
  edges?: Array<IndexedEdge>
  /** The revision of the input the edges were judged in (their positions are located in the raw file at that revision). */
  revision?: string
  /** What was served: a module that is its own violation, or an edge module (`ImportProtectionEnv.mismatches`). */
  served?: 'mock' | 'real'
  /** The module is client references in its environment (`ImportEdgesFacts.clientReferences`). */
  clientReferences?: true
}
