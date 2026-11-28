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

/** A pattern's start that the root-relative glob would not say as picomatch reads it (`untestedDependencyIds`). */
const AMBIGUOUS_PREFIX_RE = /^(?:\.\/)*!|^\.\/\.\//

/**
 * The ids of the dependency scripts the compile scope takes by their path,
 * which a host's text filter must not leave out (`dependencyTextFilter`):
 * those under the source directory (the scope checks them; with the source
 * directory at the root, every dependency of the root), and those an
 * `exclude` or `ignoreImporters` pattern exempts (compiled, so that their
 * imports are read). It must let through every path the public matcher
 * exempts (`ImportProtection.exempt`: the path relative to the root, or the
 * absolute path outside it). A glob is turned into the id filters of the
 * root-relative and of the absolute paths it matches, each with the pattern
 * as a literal too (the matcher takes a path equal to the pattern before
 * the glob). A pattern no id filter says faithfully (a `RegExp`, matched
 * against a path no id is; a whole-pattern negation, also behind `./`; a
 * pattern with more than one leading `./`; one picomatch refuses) lets every
 * dependency script through: the compile scope decides. An empty pattern
 * matches no path. Ids are normalized (`/`).
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
  /** The id filters of the paths `glob` matches, and of the path equal to it (an id may carry a query). */
  const idsOf = (glob: string, literal: string) => [
    new RegExp(
      `${picomatch.makeRe(glob, { dot: true }).source.replace(/\$$/, '')}(?:\\?|$)`,
    ),
    new RegExp(`^${escapeRegExp(literal)}(?:\\?|$)`),
  ]
  for (const { pattern } of [...config.exclude, ...config.ignoreImporters]) {
    if (pattern === '') {
      continue
    }
    if (pattern instanceof RegExp || AMBIGUOUS_PREFIX_RE.test(pattern)) {
      return [DEPENDENCY_SCRIPT_RE]
    }
    const relative = pattern.replace(/^\.\//, '')
    try {
      // (the root's own glob characters are escaped: a literal part of the pattern)
      ids.push(
        ...idsOf(
          `${root.replace(/[*?!+@[\](){}|]/g, '\\$&')}/${relative}`,
          `${root}/${relative}`,
        ),
        ...idsOf(pattern, pattern),
      )
    } catch {
      return [DEPENDENCY_SCRIPT_RE]
    }
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
