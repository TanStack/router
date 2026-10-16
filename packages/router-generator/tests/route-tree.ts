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

/** A stub route: records what the route tree does with it. */
function stubRoute(file: string | null) {
  return `({
  file: ${JSON.stringify(file)},
  options: {},
  update(options) { Object.assign(this.options, options); return this },
  updateLoader() { return this },
  lazy() { return this },
  _addFileChildren(children) { this.children = children; return this },
  _addFileTypes() { return this },
})`
}

/** A stub of the router package, for routes without a file. */
const routerModule = `export const createFileRoute = () => () => ${stubRoute(null)}
export const lazyRouteComponent = () => 'lazyRouteComponent'
export const lazyFn = () => 'lazyFn'`

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

/**
 * Evaluates the generated route tree at `treeFile`, with each route file it
 * imports replaced by a stub, and returns its routes: route id (as in
 * `FileRoutesById`) to the route file, relative to the tree (null for a route
 * without a file), with the root route as `__root__`. Like a bundler, fails on
 * an invalid module or a static or dynamic import that does not resolve to a
 * file.
 */
export async function routesOf(
  treeFile: string,
): Promise<Record<string, string | null>> {
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
  for (const dynamicImport of module.dynamicImports) {
    const literal = code.slice(
      dynamicImport.moduleRequest.start,
      dynamicImport.moduleRequest.end,
    )
    const specifier = literal.slice(1, -1)
    if (!(await resolveImport(specifier, treeFile))) {
      throw new Error(
        `The route tree dynamic import "${specifier}" does not resolve`,
      )
    }
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

  const routes: Record<string, string | null> = { __root__: routeTree.file }
  const visit = (parentId: string, children: Record<string, any> = {}) => {
    for (const child of Object.values(children)) {
      const id = joinPaths(parentId, child.options.id)
      routes[id] = child.file
      visit(id, child.children)
    }
  }
  visit('', routeTree.children)
  return routes
}
