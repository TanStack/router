/**
 * Which modules the Start compiler compiles, in every host (the Vite plugin's
 * transform, the Rsbuild loader).
 */
import { HYDRATE_COMPONENT } from '../planners/hydrate'
import { startRecognizer } from './recognizer'
import type { ImportProtection } from '../import-protection/session'

export const NODE_MODULES_RE = /[\\/]node_modules[\\/]/

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/**
 * The app's own modules are all compiled: a Start value reaches a module
 * under any name (recognition by binding, through re-exports), and import
 * protection judges the edges of every module it checks. A dependency
 * (`node_modules`) is compiled when import protection checks it, or when its
 * text names what the planners recognise: an export of the recognizer table
 * (`createServerFn`, `ClientOnly`, …), a builder's terminal call (`.handler(`,
 * `.server(`, `.client(`), the `Hydrate` boundary, or an import-protection
 * marker. A library that renames a factory and calls the rename without
 * naming any of these is not compiled (the Start libraries an app depends on
 * name them). The text test is cheap: it runs before any parse or read.
 */
export function startCompileScope(
  ip: ImportProtection | null,
): (path: string, code: string) => boolean {
  const startText = startTextTest(ip)
  return (path, code) =>
    !NODE_MODULES_RE.test(path) ||
    (ip?.inScope(path) ?? false) ||
    startText.test(code)
}

/** Whether a text names what the planners recognise (see `startCompileScope`). */
function startTextTest(ip: ImportProtection | null): RegExp {
  const names = new Set(
    Object.values(startRecognizer().factories).flatMap((exports) =>
      Object.keys(exports),
    ),
  )
  names.add(HYDRATE_COMPONENT)
  return new RegExp(
    [
      ...names,
      String.raw`\.\s*(?:handler|server|client)\s*\(`,
      ...Object.keys(ip?.markerSpecifiers ?? {}).map(escape),
    ].join('|'),
  )
}

/** An ES re-export (`export * from`, `export * as ns from`, `export { … } from`): the module's exports are elsewhere. */
const REEXPORT_RE =
  /\bexport\s*(?:\*|\{[\s\S]*?\})(?:\s*as\s*[\w$]+)?\s*from\s*['"]/

/**
 * Whether a dependency module is opaque to the summaries (`RawFactsOptions.opaque`):
 * an ordinary package's exports carry no Start value, so its text is never
 * parsed for one. A module of `node_modules` is read when import protection
 * checks it, when its text names what the planners recognise (the test of
 * `startCompileScope`), or when it re-exports another module (a library's
 * barrel: the values are behind it). The rest of a dependency graph stays
 * unread.
 */
export function opaquePackageModule(
  ip: ImportProtection | null,
): (path: string, text: string) => boolean {
  const startText = startTextTest(ip)
  return (path, text) =>
    NODE_MODULES_RE.test(path) &&
    !(ip?.inScope(path) ?? false) &&
    !startText.test(text) &&
    !REEXPORT_RE.test(text)
}
