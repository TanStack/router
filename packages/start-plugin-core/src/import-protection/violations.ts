/**
 * A violation as the `import-edges` planner records it (plain data: plan
 * facts, Rspack `buildInfo`) and as `onViolation` receives it
 * (`ViolationInfo`, J6.5).
 */
import { identify } from '@tanstack/router-utils/compiler'
import { patternOf, rulesFor } from './rules'
import type { EdgeModuleContent } from './edge-modules'
import type { ImportProtectionConfig } from './config'
import type { EnvType, RuleRef, ViolationType } from './rules'
import type { OriginalLocation } from './locate'
import type { TraceStep, ViolationInfo } from './trace'

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
  behavior: 'error' | 'mock'
  /** The edge module the specifier was substituted with (null: not substituted, dev `error`). */
  module: { key: string; content: EdgeModuleContent } | null
}

/** What the planner stores in `plan.facts.planners['import-edges']`. */
export interface ImportEdgesFacts {
  /** Violations by output id (only outputs that have some). */
  violations: Record<string, Array<EdgeViolation>>
}

/** The violations of one compiled output (`CompileOutput.facts`, `CompileOutput.output`). */
export function violationsOf(output: {
  facts: { planners: Record<string, unknown> }
  output: string
}): Array<EdgeViolation> {
  const facts = output.facts.planners[IMPORT_EDGES_PLANNER] as
    | ImportEdgesFacts
    | undefined
  return facts?.violations[output.output] ?? []
}

/** `log: 'once'` dedupes by this key: the logical edge's provenance (env, importer, raw specifier, target). */
export function dedupeKey(v: EdgeViolation): string {
  return [v.env, v.importer, v.specifier, v.resolved ?? ''].join('\u0000')
}

export function violationType(rule: RuleRef): ViolationType {
  return rule.type
}

/**
 * The `ViolationInfo` of a violation. `trace` is read from the bundler's
 * graph when it is first read (dev: the graph may not know the importer's
 * importers yet when `onViolation` runs; a report freezes it when printed).
 */
export function violationInfo(
  v: EdgeViolation,
  config: ImportProtectionConfig,
  trace: () => Array<TraceStep>,
): ViolationInfo & { freezeTrace: () => Array<TraceStep> } {
  const rules = rulesFor(config, v.envType)
  const pattern = patternOf(rules, v.rule)
  let frozen: Array<TraceStep> | null = null
  const withImporterStep = (steps: Array<TraceStep>): Array<TraceStep> => {
    const last = steps[steps.length - 1]
    if (last && identify(last.file).path === v.importer) {
      last.specifier = v.specifier
      if (v.loc && v.loc.file === v.importer) {
        last.line = v.loc.line
        last.column = v.loc.column
      }
    }
    return steps
  }
  const info = {
    env: v.env,
    envType: v.envType,
    type: v.rule.type,
    behavior: v.behavior,
    ...(pattern !== undefined && { pattern }),
    specifier: v.specifier,
    importer: v.importer,
    ...(v.loc && { importerLoc: { ...v.loc } }),
    ...(v.resolved !== null && { resolved: identify(v.resolved).path }),
  } as ViolationInfo & { freezeTrace: () => Array<TraceStep> }
  Object.defineProperty(info, 'trace', {
    enumerable: true,
    configurable: true,
    get: () => frozen ?? withImporterStep(trace()),
  })
  Object.defineProperty(info, 'freezeTrace', {
    enumerable: false,
    value: () => (frozen ??= withImporterStep(trace())),
  })
  return info
}
