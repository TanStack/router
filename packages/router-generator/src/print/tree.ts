import path from 'node:path'
import { rootRouteId } from '@tanstack/router-core/tooling'
import { removeExt, replaceBackslash } from '../utils'
import { key, lit } from './style'
import type { CodeStyle } from './style'
import type { ModelRoute, RoutePieceName, TreeModel } from '../types'

export interface PrintTreeOptions {
  style: CodeStyle
  disableTypes: boolean
  /** The router package the tree imports its runtime from (`@tanstack/react-router`). */
  routerPackage: string
  /** Where the tree is written (its imports are relative to it). */
  treeFile: string
  addExtensions: boolean | string
  importRoutesUsingAbsolutePaths: boolean
  header: ReadonlyArray<string>
  footer: ReadonlyArray<string>
}

const componentPieces = [
  'component',
  'errorComponent',
  'notFoundComponent',
  'pendingComponent',
] as const satisfies ReadonlyArray<RoutePieceName>

/** The name of the value a route has once its children are added. */
function resolvedName(route: ModelRoute) {
  return route.children.length
    ? `${route.variableName}RouteWithChildren`
    : `${route.variableName}Route`
}

function parentName(route: ModelRoute) {
  return route.parent ? `${route.parent.variableName}Route` : 'rootRouteImport'
}

/**
 * Prints the route tree module of `model` in the configured style: the
 * runtime tree and, unless disabled, its types, both from the same model
 * (SPEC J1.13). Every string goes through one escaper (`lit`), every import
 * of a route file through one specifier function.
 */
export function printTree(model: TreeModel, options: PrintTreeOptions) {
  const { style, disableTypes } = options
  const q = (value: string) => lit(value, style.quote)
  const semi = style.semicolons ? ';' : ''
  const memberSemi = style.semicolons ? ';' : ''
  const runtime = new Set<'createFileRoute' | 'lazyRouteComponent' | 'lazyFn'>()

  const specifierFor = (file: string) => {
    const keepExtension = file.endsWith('.vue')
    if (options.importRoutesUsingAbsolutePaths) {
      return replaceBackslash(
        keepExtension ? file : removeExt(file, options.addExtensions),
      )
    }
    const relative = replaceBackslash(
      path.relative(path.dirname(options.treeFile), file),
    )
    const withoutExt = keepExtension
      ? relative
      : removeExt(relative, options.addExtensions)
    return withoutExt.startsWith('../') ? withoutExt : `./${withoutExt}`
  }
  const dynamicImport = (file: string) => `import(${q(specifierFor(file))})`

  const componentUpdate = (
    pieces: ModelRoute['pieces'],
    indent: string,
  ): string | undefined => {
    const entries = componentPieces.flatMap((option) => {
      const file = pieces[option]
      if (!file) {
        return []
      }
      runtime.add('lazyRouteComponent')
      // A Vue single-file component's component is its default export
      const exportName = file.endsWith('.vue') ? 'default' : option
      return [
        `${indent}  ${option}: lazyRouteComponent(() => ${dynamicImport(file)}, ${q(exportName)}),`,
      ]
    })
    return entries.length
      ? `.update({\n${entries.join('\n')}\n${indent}})`
      : undefined
  }

  const routeImports: Array<string> = [
    `import { Route as rootRouteImport } from ${q(specifierFor(model.root.file))}${semi}`,
  ]
  const anchors: Array<string> = []
  const updates: Array<string> = []

  for (const route of model.routes) {
    const imported = `${route.variableName}RouteImport`
    if (route.isAnchor || !route.file) {
      runtime.add('createFileRoute')
      anchors.push(
        `const ${imported} = createFileRoute(${q(route.routePath)})()${semi}`,
      )
    } else {
      routeImports.push(
        `import { Route as ${imported} } from ${q(specifierFor(route.file))}${semi}`,
      )
    }

    const options = [
      `  id: ${q(route.relativeId)},`,
      ...(route.pathOption !== undefined
        ? [`  path: ${q(route.pathOption)},`]
        : []),
      `  getParentRoute: () => ${parentName(route)},`,
    ]
    const chain: Array<string> = []
    if (route.pieces.loader) {
      runtime.add('lazyFn')
      chain.push(
        `  .updateLoader({\n    loader: lazyFn(() => ${dynamicImport(route.pieces.loader)}, ${q('loader')}),\n  })`,
      )
    }
    const components = componentUpdate(route.pieces, '  ')
    if (components) {
      chain.push(`  ${components}`)
    }
    if (route.pieces.lazy) {
      chain.push(
        `  .lazy(() => ${dynamicImport(route.pieces.lazy)}.then((d) => d.Route))`,
      )
    }
    updates.push(
      `const ${route.variableName}Route = ${imported}.update({\n${options.join('\n')}\n}${disableTypes ? '' : ' as any'})${chain.length ? `\n${chain.join('\n')}` : ''}${semi}`,
    )
  }

  const sections: Array<string> = []

  if (!disableTypes) {
    sections.push(printTypes(model, options))
  }

  // Each route with children: its children object and the route with them,
  // children before parents.
  const childrenBlocks: Array<string> = []
  const addChildren = (route: ModelRoute) => {
    if (!route.children.length) {
      return
    }
    route.children.forEach(addChildren)
    const name = `${route.variableName}RouteChildren`
    if (!disableTypes) {
      childrenBlocks.push(
        `interface ${name} {\n${route.children
          .map(
            (child) =>
              `  ${child.variableName}Route: typeof ${resolvedName(child)}${memberSemi}`,
          )
          .join('\n')}\n}`,
      )
    }
    childrenBlocks.push(
      `const ${name}${disableTypes ? '' : `: ${name}`} = {\n${route.children
        .map((child) => `  ${child.variableName}Route: ${resolvedName(child)},`)
        .join('\n')}\n}${semi}`,
    )
    childrenBlocks.push(
      `const ${route.variableName}RouteWithChildren = ${route.variableName}Route._addFileChildren(${name})${semi}`,
    )
  }
  model.children.forEach(addChildren)

  const rootComponents = componentUpdate(model.root.pieces, '  ')
  const rootChildren = [
    `const rootRouteChildren${disableTypes ? '' : ': RootRouteChildren'} = {\n${model.children
      .map((child) => `  ${child.variableName}Route: ${resolvedName(child)},`)
      .join('\n')}\n}${semi}`,
    `export const routeTree = rootRouteImport${rootComponents ? `\n  ${rootComponents}` : ''}\n  ._addFileChildren(rootRouteChildren)${disableTypes ? '' : '\n  ._addFileTypes<FileRouteTypes>()'}${semi}`,
  ]

  const runtimeImport = runtime.size
    ? [
        `import { ${[...runtime].sort().join(', ')} } from ${q(options.routerPackage)}${semi}`,
      ]
    : []

  const blocks = [
    options.header.join('\n'),
    `// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.`,
    [...runtimeImport, ...routeImports].join('\n'),
    anchors.join('\n'),
    updates.join('\n'),
    ...sections,
    childrenBlocks.join('\n\n'),
    rootChildren.join('\n'),
    options.footer.join('\n'),
  ]
  return `${blocks.filter(Boolean).join('\n\n')}\n`
}

function printTypes(model: TreeModel, options: PrintTreeOptions) {
  const { style } = options
  const q = (value: string) => lit(value, style.quote)
  const memberSemi = style.semicolons ? ';' : ''
  const member = (name: string, type: string, indent = '  ') =>
    `${indent}${key(name, style)}: ${type}${memberSemi}`
  const union = (values: Array<string>) =>
    values.length ? values.map(q).join(' | ') : 'never'

  const byFullPath = routesByFullPath(model.attachOrder)
  const byTo = routesByTo(model.attachOrder)
  const byId = new Map(model.attachOrder.map((route) => [route.id, route]))
  const fullPaths = [...byFullPath.keys()].filter(Boolean)
  const tos = [...byTo.keys()].filter(Boolean)
  const ids = [...byId.keys()]

  const interfaceOf = (name: string, members: Array<string>) =>
    `export interface ${name} {\n${members.join('\n')}\n}`

  const types = [
    interfaceOf(
      'FileRoutesByFullPath',
      fullPaths.map((fullPath) =>
        member(fullPath, `typeof ${resolvedName(byFullPath.get(fullPath)!)}`),
      ),
    ),
    interfaceOf(
      'FileRoutesByTo',
      tos.map((to) => member(to, `typeof ${resolvedName(byTo.get(to)!)}`)),
    ),
    interfaceOf('FileRoutesById', [
      member(rootRouteId, 'typeof rootRouteImport'),
      ...[...byId].map(([id, route]) =>
        member(id, `typeof ${resolvedName(route)}`),
      ),
    ]),
    interfaceOf('FileRouteTypes', [
      member('fileRoutesByFullPath', 'FileRoutesByFullPath'),
      member('fullPaths', union(fullPaths)),
      member('fileRoutesByTo', 'FileRoutesByTo'),
      member('to', union(tos)),
      member('id', union([rootRouteId, ...ids])),
      member('fileRoutesById', 'FileRoutesById'),
    ]),
    interfaceOf(
      'RootRouteChildren',
      model.children.map((child) =>
        member(`${child.variableName}Route`, `typeof ${resolvedName(child)}`),
      ),
    ),
  ].join('\n')

  const byPath = model.routes
    .map((route) =>
      [
        `    ${key(route.routePath, style)}: {`,
        member('id', q(route.id), '      '),
        member('path', q(route.typePath), '      '),
        member('fullPath', q(route.fullPath), '      '),
        member(
          'preLoaderRoute',
          `typeof ${route.variableName}RouteImport`,
          '      ',
        ),
        member('parentRoute', `typeof ${parentName(route)}`, '      '),
        `    }${memberSemi}`,
      ].join('\n'),
    )
    .join('\n')
  const declareModule = `declare module ${q(options.routerPackage)} {\n  interface FileRoutesByPath {\n${byPath}\n  }\n}`

  return `${types}\n\n${declareModule}`
}

const isIndex = (route: ModelRoute) => route.routePath.endsWith('/')
const isPathless = (route: ModelRoute) => route.kind === 'pathless_layout'

/**
 * The route each full path stands for in the types: a route over its own
 * pathless layout, the index route over others at `/`.
 */
function routesByFullPath(routes: ReadonlyArray<ModelRoute>) {
  const map = new Map<string, ModelRoute>()
  for (const route of routes) {
    const existing = map.get(route.fullPath)
    if (existing) {
      if (
        route.fullPath === '/' &&
        existing.typePath === '/' &&
        route.typePath !== '/'
      ) {
        continue
      }
      if (isPathless(route) && !isPathless(existing)) {
        continue
      }
    }
    map.set(route.fullPath, route)
  }
  return map
}

/**
 * The route each `to` stands for in the types: an index route over the
 * route of its directory, a route over a pathless layout with the same
 * `to`.
 */
function routesByTo(routes: ReadonlyArray<ModelRoute>) {
  const map = new Map<string, ModelRoute>()
  for (const route of routes) {
    // A route with an index child: `to` is the index route's
    if (route.children.some((child) => child.typePath === '/')) {
      continue
    }
    const existing = map.get(route.to)
    if (existing) {
      if (isIndex(route) !== isIndex(existing)) {
        if (!isIndex(route)) {
          continue
        }
      } else if (isPathless(route) !== isPathless(existing)) {
        if (isPathless(route)) {
          continue
        }
      }
    }
    map.set(route.to, route)
  }
  return map
}
