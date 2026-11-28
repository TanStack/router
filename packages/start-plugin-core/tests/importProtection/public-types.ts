/**
 * The public types of Start's import protection, as a user writes them: the
 * `importProtection` option of `tanstackStart()` and what its `onViolation`
 * callback receives. No package entry exports `ViolationInfo` (the option's
 * `onViolation` takes `unknown`), so it is declared here from the guide
 * (`docs/start/framework/react/guide/import-protection.md`, "The
 * `onViolation` Callback") and SPEC J6.5/J6.6, not imported from the
 * implementation.
 */
import type { TanStackStartInputConfig } from '../../src'

/** Start's `importProtection` option (`tanstackStart({ importProtection })`). */
export type ImportProtectionOptions = NonNullable<
  TanStackStartInputConfig['importProtection']
>

/** A location in a file: 1-based line and column. */
export interface ViolationLocation {
  file?: string
  line: number
  column: number
}

/** A step of a violation's import chain, from an entry to the importer. */
export interface ViolationTraceStep {
  file: string
  line?: number
  column?: number
  /** The specifier this step imports the next one with. */
  specifier?: string
}

/** What `onViolation` receives (the guide's list; SPEC J6.5, J6.6). */
export interface ViolationInfo {
  /** The environment's name (e.g. `client`, `ssr`). */
  env: string
  envType: 'client' | 'server'
  type: 'specifier' | 'file' | 'marker'
  /** The rule that matched (specifier and file rules). */
  pattern?: string | RegExp
  /** The raw import string. */
  specifier: string
  /** Absolute path of the importing file. */
  importer: string
  /**
   * Where in the importer's original source the violation is (SPEC J6.5:
   * optional, `trace.ts:163-174`).
   */
  importerLoc?: ViolationLocation
  /** Absolute path of the resolved target, when available. */
  resolved?: string
  trace: Array<ViolationTraceStep>
  /** The code frame of the violation, when available. */
  snippet?: { lines: Array<string>; highlightLine: number; location: string }
}
