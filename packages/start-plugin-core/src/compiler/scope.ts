/**
 * Which modules the Start compiler compiles, in every host (the Vite plugin's
 * transform, the Rsbuild loader).
 */
import picomatch from 'picomatch'
import { escapeRegExp, normalizePath } from '../utils'
import { startRecognizer } from './recognizer'
import type { ImportProtectionConfig } from '../import-protection/config'
import type { ImportProtection } from '../import-protection/session'

export const NODE_MODULES_RE = /[\\/]node_modules[\\/]/

/**
 * The app's own modules are all compiled: a Start value reaches a module
 * under any name (recognition by binding, through re-exports), and import
 * protection judges the edges of every module it checks. A dependency
 * (`node_modules`) is compiled when import protection checks it or the user
 * exempts it as an importer (`exclude`, `ignoreImporters`: its imports are
 * read, so a denied module it imports is the real one), when the router
 * generator registered it as a route file, or when its text names what the
 * planners recognise: an export of the recognizer table (`createServerFn`,
 * `ClientOnly`, …), a builder method's call (`.handler(`, `.server(`,
 * `.client(`, `.validator(`, `.middleware(`, with type arguments too), the
 * `Hydrate` boundary, or an import-protection marker. A library that renames
 * a factory and calls the rename without naming any of these is not compiled
 * (the Start libraries an app depends on name them). The text test is cheap:
 * it runs before any parse or read.
 */
export function startCompileScope(
  ip: ImportProtection | null,
  registeredRoute: (path: string) => boolean,
): (path: string, code: string) => boolean {
  const startText = startTextTest(ip?.config ?? null)
  return (path, code) =>
    !NODE_MODULES_RE.test(path) ||
    (ip !== null && (ip.inScope(path) || ip.exempt(path))) ||
    startText.test(code) ||
    (ROUTE_CONSTRUCTOR_RE.test(code) && registeredRoute(path))
}

/**
 * A route constructor's call, in every form the router generator accepts:
 * the text side of a route file the generator registered (its registry
 * decides).
 */
const ROUTE_CONSTRUCTOR_RE =
  /\bcreate(?:Lazy)?FileRoute\b|\bcreateRootRoute(?:WithContext)?\b/

/**
 * The text test a host may run on dependency modules before handing them to
 * the compiler (a transform hook's code filter): the text side of
 * `startCompileScope`. Null when import protection's scope may reach any
 * dependency by its path (an `include`), which no text test sees. The
 * dependencies the scope or an exemption reaches by their path are let
 * through by `untestedDependencyIds`.
 */
export function dependencyTextFilter(
  config: ImportProtectionConfig | null,
): RegExp | null {
  if (config && config.include.length > 0) {
    return null
  }
  const text = startTextTest(config)
  return new RegExp(`${text.source}|${ROUTE_CONSTRUCTOR_RE.source}`)
}

/** A dependency's script module, wherever it is (`node_modules` in its path, not its query). */
export const DEPENDENCY_SCRIPT_RE =
  /^[^?]*[\\/]node_modules[\\/][^?]*\.[cm]?[tj]sx?(?:$|\?)/

/**
 * The ids of the dependency scripts the compile scope takes by their path,
 * which a host's text filter must not leave out (`dependencyTextFilter`):
 * those under the source directory (the scope checks them; with the source
 * directory at the root, every dependency of the root), and those an
 * `exclude` or `ignoreImporters` pattern exempts (compiled, so that their
 * imports are read). A glob or a literal pattern is turned into the id
 * filter of the root-relative paths it matches; a `RegExp` pattern, matched
 * against a root-relative path no id filter sees, lets every dependency
 * script through (the compile scope decides). Ids are normalized (`/`).
 */
export function untestedDependencyIds(
  config: ImportProtectionConfig | null,
): Array<RegExp> {
  if (!config) {
    return []
  }
  const root = normalizePath(config.root).replace(/\/$/, '')
  const src = normalizePath(config.srcDirectory).replace(/\/$/, '')
  const ids = [
    new RegExp(
      `^${escapeRegExp(src)}/(?:[^?]*/)?node_modules/[^?]*\\.[cm]?[tj]sx?(?:$|\\?)`,
    ),
  ]
  /** An id filter of the paths `glob` matches (anchored at the end of the path: an id may carry a query). */
  const idsOf = (glob: string) =>
    new RegExp(
      `${picomatch.makeRe(glob, { dot: true }).source.replace(/\$$/, '')}(?:\\?|$)`,
    )
  for (const { pattern } of [...config.exclude, ...config.ignoreImporters]) {
    if (pattern instanceof RegExp) {
      return [DEPENDENCY_SCRIPT_RE]
    }
    // the public matcher is given a file's path relative to the root, or its
    // absolute path outside the root (`relativizePath`): a package hoisted
    // above it (the root's own glob characters are escaped: a literal part
    // of the pattern)
    ids.push(
      idsOf(
        `${root.replace(/[*?!+@[\](){}|]/g, '\\$&')}/${pattern.replace(/^\.\//, '')}`,
      ),
      idsOf(pattern),
    )
  }
  return ids
}

/** Whether a text names what the planners recognise (see `startCompileScope`). */
function startTextTest(config: ImportProtectionConfig | null): RegExp {
  // (the table's exports include the `Hydrate` boundary)
  const names = new Set(
    Object.values(startRecognizer().factories).flatMap((exports) =>
      Object.keys(exports),
    ),
  )
  return new RegExp(
    [
      ...names,
      // (a builder's methods: a module of an unbundled Start library may
      // only add a validator or middleware to another module's builder;
      // `inputValidator` fails the build, naming the dependency; `<`: a
      // TypeScript type argument list before the call)
      String.raw`\.\s*(?:handler|server|client|validator|inputValidator|middleware)\s*[(<]`,
      ...Object.keys(config?.markerSpecifiers ?? {}).map(escapeRegExp),
    ].join('|'),
  )
}

/** An ES re-export (`export * from`, `export * as ns from`, `export { … } from`): the module's exports are elsewhere. */
const REEXPORT_RE =
  /\bexport\s*(?:\*|\{[\s\S]*?\})(?:\s*as\s*[\w$]+)?\s*from\s*['"]/

/**
 * Whether a dependency module is opaque to the summaries (`RawFactsOptions.opaque`):
 * an ordinary package's exports carry no Start value, so its text is never
 * parsed for one. A module of `node_modules` is read when its package
 * declares Start (`startPackage`: a Start value may be forwarded under any
 * name), when import protection checks it, when its text names what the
 * planners recognise (the test of `startCompileScope`), or when it
 * re-exports another module (a library's barrel: the values are behind it).
 * The rest of a dependency graph stays unread.
 */
export function opaquePackageModule(
  ip: ImportProtection | null,
  startPackage: (path: string) => boolean,
): (path: string, text: string) => boolean {
  const startText = startTextTest(ip?.config ?? null)
  return (path, text) =>
    NODE_MODULES_RE.test(path) &&
    !(ip?.inScope(path) ?? false) &&
    !startText.test(text) &&
    !REEXPORT_RE.test(text) &&
    !startPackage(path)
}
