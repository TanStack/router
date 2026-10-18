/**
 * Shared test helper: the routes a generated route tree gives the app, found
 * by evaluating the tree (not by reading its text).
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseSync, transformWithOxc } from 'vite'

/** The router packages a route tree may import runtime helpers from. */
const routerPackages = /^@tanstack\/(?:react|solid|vue)-router$/

async function isFile(filePath: string) {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

/**
 * Resolves an import of `importer` to a file on disk like a bundler does for
 * TypeScript projects: the exact file, a `.js`/`.jsx` specifier to its
 * TypeScript source, or an extensionless specifier to a script file. Returns
 * undefined for an import that does not resolve.
 */
export async function resolveImport(specifier: string, importer: string) {
  const base = path.isAbsolute(specifier)
    ? specifier
    : path.resolve(path.dirname(importer), specifier)
  const candidates = [base]
  if (/\.jsx?$/.test(base)) {
    const stem = base.replace(/\.jsx?$/, '')
    candidates.push(`${stem}.ts`, `${stem}.tsx`)
  }
  candidates.push(...['.tsx', '.ts', '.jsx', '.js'].map((ext) => base + ext))
  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return candidate
    }
  }
  return undefined
}

/**
 * A stub route: records what the route tree does with it (its options,
 * loader options and lazy route module, and its children).
 */
function stubRoute(file: string | null) {
  return `({
  file: ${JSON.stringify(file)},
  options: {},
  update(options) { Object.assign(this.options, options); return this },
  updateLoader(options) { Object.assign(this.options, options); return this },
  lazy(importer) { this.options.lazy = { importer: String(importer) }; this.lazyFn = importer; return this },
  _addFileChildren(children) { this.children = children; return this },
  _addFileTypes() { return this },
})`
}

/**
 * A stub of the router package, for routes without a file and lazily loaded
 * route options: `lazyRouteComponent` and `lazyFn` record the module they
 * load and the export they take from it.
 */
const routerModule = `export const createFileRoute = () => () => ${stubRoute(null)}
export const lazyRouteComponent = (importer, name) => ({ kind: 'lazyRouteComponent', importer: String(importer), name })
export const lazyFn = (importer, name) => ({ kind: 'lazyFn', importer: String(importer), name })`

let evaluations = 0

/**
 * A module URL for `code`, unique to an evaluation so that route trees and
 * stubs with the same code are not shared between evaluations.
 */
function dataUrl(code: string, evaluation: number) {
  return `data:text/javascript,${encodeURIComponent(`${code}\n// ${evaluation}`)}`
}

function joinPaths(...paths: Array<string>) {
  return paths.join('/').replace(/\/{2,}/g, '/')
}

/** A route of an evaluated route tree, with its id (as in `FileRoutesById`). */
interface EvaluatedRoute {
  id: string
  /** The route file, relative to the tree (null for a route without a file). */
  file: string | null
  options: Record<string, any>
  /** The function the route tree gave `route.lazy()`, if any. */
  lazyFn?: () => Promise<unknown>
  /**
   * The URL path the route matches: the `path` options of the route and its
   * parents joined (a route without a `path`, such as a pathless layout,
   * adds nothing to its parent's).
   */
  url: string
}

/**
 * Evaluates the generated route tree at `treeFile`, with each route file it
 * imports replaced by a stub, and returns its routes, the root route first
 * (as `__root__`), and a function giving the file (relative to the tree) a
 * recorded lazy import loads. Like a bundler, fails on an invalid module or a
 * static or dynamic import that does not resolve to a file.
 */
async function evaluateRouteTree(
  treeFile: string,
  importLazily?: (file: string) => Record<string, unknown>,
) {
  const evaluation = ++evaluations
  const source = await readFile(treeFile, 'utf8')
  const { code } = await transformWithOxc(source, path.basename(treeFile))
  const { module, errors } = parseSync('routeTree.js', code)
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join('\n'))
  }

  const relative = (file: string) =>
    path.relative(path.dirname(treeFile), file).replaceAll(path.sep, '/')

  const replacements: Array<{ start: number; end: number; text: string }> = []
  for (const statement of module.staticImports) {
    const specifier = statement.moduleRequest.value
    let replacement: string
    if (routerPackages.test(specifier)) {
      replacement = dataUrl(routerModule, evaluation)
    } else {
      const file = await resolveImport(specifier, treeFile)
      if (!file) {
        throw new Error(`The route tree import "${specifier}" does not resolve`)
      }
      replacement = dataUrl(
        `export const Route = ${stubRoute(relative(file))}`,
        evaluation,
      )
    }
    replacements.push({
      start: statement.moduleRequest.start,
      end: statement.moduleRequest.end,
      text: JSON.stringify(replacement),
    })
  }
  /** The module each dynamic import loads, by specifier. */
  const lazyModules = new Map<string, string>()
  for (const dynamicImport of module.dynamicImports) {
    const literal = code.slice(
      dynamicImport.moduleRequest.start,
      dynamicImport.moduleRequest.end,
    )
    const specifier = literal.slice(1, -1)
    const file = await resolveImport(specifier, treeFile)
    if (!file) {
      throw new Error(
        `The route tree dynamic import "${specifier}" does not resolve`,
      )
    }
    lazyModules.set(specifier, relative(file))
    if (importLazily) {
      // `import(` → the loader of the evaluation
      replacements.push({
        start: dynamicImport.start,
        end: dynamicImport.moduleRequest.start,
        text: `globalThis.__tsrRouteTreeImport${evaluation}(`,
      })
    }
  }
  if (importLazily) {
    ;(globalThis as Record<string, unknown>)[
      `__tsrRouteTreeImport${evaluation}`
    ] = (specifier: string) =>
      Promise.resolve().then(() => importLazily(lazyModules.get(specifier)!))
  }

  let linked = code
  for (const { start, end, text } of replacements.sort(
    (a, b) => b.start - a.start,
  )) {
    linked = linked.slice(0, start) + text + linked.slice(end)
  }

  const { routeTree } = await import(
    /* @vite-ignore */ dataUrl(linked, evaluation)
  )

  const routes: Array<EvaluatedRoute> = [
    {
      id: '__root__',
      file: routeTree.file,
      options: routeTree.options,
      lazyFn: routeTree.lazyFn,
      url: '/',
    },
  ]
  const visit = (
    parentId: string,
    parentUrl: string,
    children: Record<string, any> = {},
  ) => {
    for (const child of Object.values(children)) {
      const id = joinPaths(parentId, child.options.id)
      const url =
        child.options.path === undefined
          ? parentUrl
          : joinPaths(parentUrl, child.options.path)
      routes.push({
        id,
        file: child.file,
        options: child.options,
        lazyFn: child.lazyFn,
        url,
      })
      visit(id, url, child.children)
    }
  }
  visit('', '/', routeTree.children)

  /** The file a recorded lazy import (`() => import('…')…`) loads. */
  const lazyFile = async (importer: string) => {
    const specifier = /import\((['"`])(.+?)\1\)/.exec(importer)?.[2]
    if (!specifier) {
      throw new Error(`No import in ${importer}`)
    }
    const file = await resolveImport(specifier, treeFile)
    if (!file) {
      throw new Error(`The lazy import "${specifier}" does not resolve`)
    }
    return relative(file)
  }
  return { routes, lazyFile }
}

/**
 * Evaluates the generated route tree at `treeFile` (see `evaluateRouteTree`)
 * and returns its routes: route id (as in `FileRoutesById`) to the route
 * file, relative to the tree (null for a route without a file), with the root
 * route as `__root__`.
 */
export async function routesOf(
  treeFile: string,
): Promise<Record<string, string | null>> {
  const { routes } = await evaluateRouteTree(treeFile)
  return Object.fromEntries(routes.map(({ id, file }) => [id, file]))
}

/**
 * Evaluates the generated route tree at `treeFile` (see `evaluateRouteTree`)
 * and returns the options the tree gives each route, by route id (the root
 * route as `__root__`), without the `id`, `path` and `getParentRoute` options
 * that place it in the tree. A lazily loaded option is described by the file
 * it loads (relative to the tree) and, for `lazyRouteComponent` / `lazyFn`,
 * the export it takes: `{ kind, file, name }`; the lazy route module of a
 * route as `lazy: { file }`.
 */
export async function routeOptionsOf(
  treeFile: string,
): Promise<Record<string, Record<string, unknown>>> {
  const { routes, lazyFile } = await evaluateRouteTree(treeFile)
  const result: Record<string, Record<string, unknown>> = {}
  for (const route of routes) {
    const options: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(route.options)) {
      if (['id', 'path', 'getParentRoute'].includes(key)) {
        continue
      }
      if (value && typeof value === 'object' && 'importer' in value) {
        options[key] =
          key === 'lazy'
            ? { file: await lazyFile(value.importer) }
            : {
                kind: value.kind,
                file: await lazyFile(value.importer),
                name: value.name,
              }
      } else {
        options[key] = value
      }
    }
    result[route.id] = options
  }
  return result
}

/**
 * Evaluates the generated route tree at `treeFile` (see `evaluateRouteTree`)
 * and returns the URL path each route matches, by route id (the root route
 * as `__root__`).
 */
export async function urlsOf(
  treeFile: string,
): Promise<Record<string, string>> {
  const { routes } = await evaluateRouteTree(treeFile)
  return Object.fromEntries(routes.map(({ id, url }) => [id, url]))
}

/**
 * Evaluates the generated route tree at `treeFile` (see `evaluateRouteTree`)
 * and returns the `path` option each route gets, by route id (the root route
 * as `__root__`); undefined for a route without one. Router-core treats a
 * route with a `path`, even `/`, as a page the URL can match on its own, and
 * a route without one (a pathless layout) as a wrapper of its children.
 */
export async function routePathsOf(
  treeFile: string,
): Promise<Record<string, string | undefined>> {
  const { routes } = await evaluateRouteTree(treeFile)
  return Object.fromEntries(routes.map(({ id, options }) => [id, options.path]))
}

/**
 * Evaluates the generated route tree at `treeFile` (see `evaluateRouteTree`)
 * and loads the lazy route of route `routeId` the way the router does
 * (`route.lazy(fn)`: the route's options are those of the lazy route `fn`
 * resolves to), each module the route tree imports dynamically being
 * `importModule(file)` (file relative to the tree). Returns the value `fn`
 * resolves to, or undefined when the route has no lazy route.
 */
export async function loadLazyRoute(
  treeFile: string,
  routeId: string,
  importModule: (file: string) => Record<string, unknown>,
): Promise<unknown> {
  const { routes } = await evaluateRouteTree(treeFile, importModule)
  const route = routes.find(({ id }) => id === routeId)
  if (!route) {
    throw new Error(`No route ${routeId} in the route tree`)
  }
  return route.lazyFn?.()
}
