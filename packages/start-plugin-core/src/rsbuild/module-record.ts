/**
 * Where the parts of a module's record live on the module (`buildInfo`,
 * which Rspack persists and restores with it): each part a field of its
 * own, so a reader of one part reads that part (Rspack converts a field
 * value by value). The one place that names the layout: the loader's writer
 * (`StartRsbuildCompilerSession.record`) and every reader go through it.
 * The located errors of a failed module are not a part: router-utils reads
 * their field itself (`LOCATED_DIAGNOSTICS`).
 */
import { RSPACK_BUILD_INFO_KEY } from '../import-protection/violations'

/** The key and dependencies of the module's plan (`PersistedPlan`; kept as one JSON string). */
export const PLAN_PART = 'tanstack.start.plan'
/** The server functions the module declares as it is served (`ServerFnBuildInfo`). */
export const SERVER_FNS_PART = 'tanstack.start.serverFns'
/** The warnings the module's latest compile found, before the once-per-run rule (`FoundWarning`). */
export const FOUND_WARNINGS_PART = 'tanstack.start.warnings'
/** Set when the module's latest compile recognised a Start use in a package. */
export const PACKAGE_USE_PART = 'tanstack.start.packageUse'
/** Import protection's record of the module, or an edge module's served state. */
export const IMPORT_PROTECTION_PART = RSPACK_BUILD_INFO_KEY

const PARTS = [
  PLAN_PART,
  SERVER_FNS_PART,
  FOUND_WARNINGS_PART,
  PACKAGE_USE_PART,
  IMPORT_PROTECTION_PART,
]

/** Replaces the parts of a module's record: each given one written, each absent one removed. */
export function putParts(
  buildInfo: Record<string, unknown>,
  parts: Partial<Record<string, unknown>>,
): void {
  for (const part of PARTS) {
    const value = parts[part]
    if (value === undefined) {
      delete buildInfo[part]
    } else {
      // (the plan as one string: a structured value is converted member by member)
      buildInfo[part] = part === PLAN_PART ? JSON.stringify(value) : value
    }
  }
}

/** A part of a module's record; undefined when the module has none. */
export function partOf(
  buildInfo: Record<string, unknown> | undefined,
  part: string,
): unknown {
  const value = buildInfo?.[part]
  return part === PLAN_PART && typeof value === 'string'
    ? JSON.parse(value)
    : value
}

/** Whether a module's `buildInfo` holds a part of a record. */
export function holdsParts(buildInfo: Record<string, unknown>): boolean {
  for (const part of PARTS) {
    if (part in buildInfo) {
      return true
    }
  }
  return false
}
