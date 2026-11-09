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
  /** The logical edge (one per user dependency; forwarded glue shares it). */
  edgeKey: string
  env: string
  envType: EnvType
  rule: RuleRef
  /** The specifier as the importer wrote it. */
  specifier: string
  /** Absolute path of the importing file (the user's, for forwarded glue). */
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
  /** The edge module the specifier was substituted with (null: not substituted, dev `error`). */
  module: { key: string; content: EdgeModuleContent } | null
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
   * Server environment: the importer renders a binding of the import as a
   * component (a JSX element, a route's `component` option), so the fix is
   * `<ClientOnly>`, never `createClientOnlyFn` (it throws while rendering on
   * the server). `at`: the first such use, in the original source.
   */
  rendered?: RenderedUse
  /** Server environment, a Vue SFC importer: the import's binding (a template's component is no JSX the compiler can see). */
  binding?: string
  /** The edge is a re-export (`export … from`): a barrel passes the module on. */
  reexport?: true
  /** Build: one importer's import of a module that is its own violation, by the pattern import found in its text. */
  pattern?: PatternImport | null
}

/** How an importer renders an import as a component (`EdgeViolation.rendered`). */
export interface RenderedUse {
  /** The binding as the importer names it. */
  name: string
  /** `jsx`: `<Name …>`; `option`: a route option such as `component: Name`. */
  via: 'jsx' | 'option'
  /** The option's key (`via: 'option'`). */
  key?: string
  at: OriginalLocation | null
}

/** The edge key of a module's own violation (`EdgeViolation.self`) in an environment. */
export function selfEdgeKey(canonicalId: string): string {
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
    effectful: boolean
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
    effectful: target.effectful,
    resolved: id,
    hasDefault: target.hasDefault,
    bare: false,
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
}

/** The violations of one compiled output (`CompileOutput.facts`, `CompileOutput.output`). */
export function violationsOf(output: {
  facts: Pick<PlanFacts, 'planners'>
  output: string
}): Array<EdgeViolation> {
  const facts = output.facts.planners[IMPORT_EDGES_PLANNER]
  return facts?.violations[output.output] ?? []
}

/** `log: 'once'` dedupes by this key: the logical edge's provenance (env, importer, raw specifier, target). */
export function dedupeKey(v: EdgeViolation): string {
  return [v.env, v.importer, v.specifier, v.resolved ?? ''].join('\u0000')
}

/**
 * What `allowImport` is told of a violation: all that is known of the import
 * before the bundler's graph is finished, so no `trace` (no chain exists yet)
 * and no `snippet` (a rendering of the source for a report, nothing a decision
 * reads).
 */
export function allowImportInfo(
  v: EdgeViolation,
  config: ImportProtectionConfig,
): AllowImportInfo {
  const pattern = patternOf(rulesFor(config, v.envType), v.rule)
  return {
    env: v.env,
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
 * The `ViolationInfo` of a violation. `trace` is read from the bundler's
 * graph when it is first read (dev: the graph may not know the importer's
 * importers yet when `onViolation` runs; a report freezes it when printed),
 * cut at `maxTraceDepth`.
 */
export function violationInfo(
  v: EdgeViolation,
  config: ImportProtectionConfig,
  trace: () => Trace,
): ReportedInfo {
  let frozen: Trace | null = null
  const withImporterStep = (t: Trace): Trace => {
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
    ...allowImportInfo(v, config),
    ...(v.snippet && {
      snippet: { ...v.snippet, lines: [...v.snippet.lines] },
    }),
  } as ReportedInfo
  Object.defineProperty(info, 'trace', {
    enumerable: true,
    configurable: true,
    get: (): Array<TraceStep> =>
      cutTrace(
        (frozen ?? withImporterStep(trace())).steps,
        config.maxTraceDepth,
      ),
  })
  Object.defineProperty(info, 'freezeTrace', {
    enumerable: false,
    value: () => (frozen ??= withImporterStep(trace())),
  })
  return info
}

/** The `buildInfo` key of the import-protection records of a module (Rspack persistent cache). */
export const RSPACK_BUILD_INFO_KEY = 'tanstack.start.ip'

/**
 * What the Rspack loader stores in an importer's `buildInfo[RSPACK_BUILD_INFO_KEY]`
 * (plain JSON, restored with the module by the persistent cache) and what
 * `finishMake` replays into the environment (`ImportProtectionEnv.replay`).
 */
export interface RspackImportProtectionBuildInfo {
  version: 1
  env: string
  /** The violations of this module's output (with their edge modules). */
  violations: Array<EdgeViolation>
  /** The module's resolved edges (the trace steps through a restored module). */
  edges?: Array<IndexedEdge>
  /** The revision of the input the edges were judged in (their positions are located in the raw file at that revision). */
  revision?: string
}
