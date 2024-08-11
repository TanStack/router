import path from 'node:path'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as prettier from 'prettier'
import { cleanPath, logging, trimPathLeft } from './utils'
import type { Config } from './config'

let latestTask = 0
export const rootPathId = '__root'
const routeGroupPatternRegex = /\(.+\)/g
const possiblyNestedRouteGroupPatternRegex = /\([^/]+\)\/?/g
const disallowedRouteGroupConfiguration = /\(([^)]+)\).(ts|js|tsx|jsx)/

export type RouteNode = {
  filePath: string
  fullPath: string
  variableName: string
  routePath?: string
  cleanedPath?: string
  path?: string
  isNonPath?: boolean
  isNonLayout?: boolean
  isLayout?: boolean
  isVirtualParentRequired?: boolean
  isVirtualParentRoute?: boolean
  isRoute?: boolean
  isLoader?: boolean
  isComponent?: boolean
  isErrorComponent?: boolean
  isPendingComponent?: boolean
  isVirtual?: boolean
  isLazy?: boolean
  isRoot?: boolean
  children?: Array<RouteNode>
  parent?: RouteNode
}

async function getRouteNodes(config: Config) {
  const { routeFilePrefix, routeFileIgnorePrefix, routeFileIgnorePattern } =
    config
  const logger = logging({ disabled: config.disableLogging })
  const routeFileIgnoreRegExp = new RegExp(routeFileIgnorePattern ?? '', 'g')

  const routeNodes: Array<RouteNode> = []

  async function recurse(dir: string) {
    const fullDir = path.resolve(config.routesDirectory, dir)
    let dirList = await fsp.readdir(fullDir, { withFileTypes: true })

    dirList = dirList.filter((d) => {
      if (
        d.name.startsWith('.') ||
        (routeFileIgnorePrefix && d.name.startsWith(routeFileIgnorePrefix))
      ) {
        return false
      }

      if (routeFilePrefix) {
        return d.name.startsWith(routeFilePrefix)
      }

      if (routeFileIgnorePattern) {
        return !d.name.match(routeFileIgnoreRegExp)
      }

      return true
    })

    await Promise.all(
      dirList.map(async (dirent) => {
        const fullPath = path.join(fullDir, dirent.name)
        const relativePath = path.join(dir, dirent.name)

        if (dirent.isDirectory()) {
          await recurse(relativePath)
        } else if (fullPath.match(/\.(tsx|ts|jsx|js)$/)) {
          const filePath = replaceBackslash(path.join(dir, dirent.name))
          const filePathNoExt = removeExt(filePath)
          let routePath =
            cleanPath(`/${filePathNoExt.split('.').join('/')}`) || ''

          if (routeFilePrefix) {
            routePath = routePath.replaceAll(routeFilePrefix, '')
          }

          if (disallowedRouteGroupConfiguration.test(dirent.name)) {
            const errorMessage = `A route configuration for a route group was found at \`${filePath}\`. This is not supported. Did you mean to use a layout/pathless route instead?`
            logger.error(`ERROR: ${errorMessage}`)
            throw new Error(errorMessage)
          }

          const variableName = routePathToVariable(routePath)

          // Remove the index from the route path and
          // if the route path is empty, use `/'

          const isLazy = routePath.endsWith('/lazy')

          if (isLazy) {
            routePath = routePath.replace(/\/lazy$/, '')
          }

          const isRoute = routePath.endsWith('/route')
          const isComponent = routePath.endsWith('/component')
          const isErrorComponent = routePath.endsWith('/errorComponent')
          const isPendingComponent = routePath.endsWith('/pendingComponent')
          const isLoader = routePath.endsWith('/loader')

          const segments = routePath.split('/')
          const isLayout =
            segments[segments.length - 1]?.startsWith('_') || false

          ;(
            [
              [isComponent, 'component'],
              [isErrorComponent, 'errorComponent'],
              [isPendingComponent, 'pendingComponent'],
              [isLoader, 'loader'],
            ] as const
          ).forEach(([isType, type]) => {
            if (isType) {
              logger.warn(
                `WARNING: The \`.${type}.tsx\` suffix used for the ${filePath} file is deprecated. Use the new \`.lazy.tsx\` suffix instead.`,
              )
            }
          })

          routePath = routePath.replace(
            /\/(component|errorComponent|pendingComponent|loader|route|lazy)$/,
            '',
          )

          if (routePath === 'index') {
            routePath = '/'
          }

          routePath = routePath.replace(/\/index$/, '/') || '/'

          routeNodes.push({
            filePath,
            fullPath,
            routePath,
            variableName,
            isRoute,
            isComponent,
            isErrorComponent,
            isPendingComponent,
            isLoader,
            isLazy,
            isLayout,
          })
        }
      }),
    )

    return routeNodes
  }

  await recurse('./')

  return routeNodes
}

let isFirst = false
let skipMessage = false

type RouteSubNode = {
  component?: RouteNode
  errorComponent?: RouteNode
  pendingComponent?: RouteNode
  loader?: RouteNode
  lazy?: RouteNode
}

export async function generator(config: Config) {
  const logger = logging({ disabled: config.disableLogging })
  logger.log('')

  if (!isFirst) {
    logger.log('♻️  Generating routes...')
    isFirst = true
  } else if (skipMessage) {
    skipMessage = false
  } else {
    logger.log('♻️  Regenerating routes...')
  }

  const taskId = latestTask + 1
  latestTask = taskId

  const checkLatest = () => {
    if (latestTask !== taskId) {
      skipMessage = true
      return false
    }

    return true
  }

  const start = Date.now()
  const routePathIdPrefix = config.routeFilePrefix ?? ''
  const beforeRouteNodes = await getRouteNodes(config)
  const rootRouteNode = beforeRouteNodes.find(
    (d) => d.routePath === `/${rootPathId}`,
  )

  const preRouteNodes = multiSortBy(beforeRouteNodes, [
    (d) => (d.routePath === '/' ? -1 : 1),
    (d) => d.routePath?.split('/').length,
    (d) => (d.filePath.match(/[./]index[.]/) ? 1 : -1),
    (d) =>
      d.filePath.match(
        /[./](component|errorComponent|pendingComponent|loader|lazy)[.]/,
      )
        ? 1
        : -1,
    (d) => (d.filePath.match(/[./]route[.]/) ? -1 : 1),
    (d) => (d.routePath?.endsWith('/') ? -1 : 1),
    (d) => d.routePath,
  ]).filter((d) => ![`/${rootPathId}`].includes(d.routePath || ''))

  const routeTree: Array<RouteNode> = []
  const routePiecesByPath: Record<string, RouteSubNode> = {}

  // Loop over the flat list of routeNodes and
  // build up a tree based on the routeNodes' routePath
  const routeNodes: Array<RouteNode> = []

  const handleNode = async (node: RouteNode) => {
    let parentRoute = hasParentRoute(routeNodes, node, node.routePath)

    // if the parent route is a virtual parent route, we need to find the real parent route
    if (parentRoute?.isVirtualParentRoute && parentRoute.children?.length) {
      // only if this sub-parent route returns a valid parent route, we use it, if not leave it as it
      const possibleParentRoute = hasParentRoute(
        parentRoute.children,
        node,
        node.routePath,
      )
      if (possibleParentRoute) {
        parentRoute = possibleParentRoute
      }
    }

    if (parentRoute) node.parent = parentRoute

    node.path = determineNodePath(node)

    const trimmedPath = trimPathLeft(node.path ?? '')

    const split = trimmedPath.split('/')
    const first = split[0] ?? trimmedPath
    const lastRouteSegment = split[split.length - 1] ?? trimmedPath

    node.isNonPath =
      lastRouteSegment.startsWith('_') ||
      routeGroupPatternRegex.test(lastRouteSegment)
    node.isNonLayout = first.endsWith('_')

    node.cleanedPath = removeGroups(
      removeUnderscores(removeLayoutSegments(node.path)) ?? '',
    )

    // Ensure the boilerplate for the route exists, which can be skipped for virtual parent routes and virtual routes
    if (!node.isVirtualParentRoute && !node.isVirtual) {
      const routeCode = fs.readFileSync(node.fullPath, 'utf-8')

      const escapedRoutePath = removeTrailingUnderscores(
        node.routePath?.replaceAll('$', '$$') ?? '',
      )

      let replaced = routeCode

      if (!routeCode) {
        if (node.isLazy) {
          replaced = [
            `import { createLazyFileRoute } from '@tanstack/react-router'`,
            `export const Route = createLazyFileRoute('${escapedRoutePath}')({
  component: () => <div>Hello ${escapedRoutePath}!</div>
})`,
          ].join('\n\n')
        } else if (
          node.isRoute ||
          (!node.isComponent &&
            !node.isErrorComponent &&
            !node.isPendingComponent &&
            !node.isLoader)
        ) {
          replaced = [
            `import { createFileRoute } from '@tanstack/react-router'`,
            `export const Route = createFileRoute('${escapedRoutePath}')({
  component: () => <div>Hello ${escapedRoutePath}!</div>
})`,
          ].join('\n\n')
        }
      } else {
        replaced = routeCode
          .replace(
            /(FileRoute\(\s*['"])([^\s]*)(['"],?\s*\))/g,
            (match, p1, p2, p3) => `${p1}${escapedRoutePath}${p3}`,
          )
          .replace(
            /(import\s*\{.*)(create(Lazy)?FileRoute)(.*\}\s*from\s*['"]@tanstack\/react-router['"])/gs,
            (match, p1, p2, p3, p4) =>
              `${p1}${node.isLazy ? 'createLazyFileRoute' : 'createFileRoute'}${p4}`,
          )
          .replace(
            /create(Lazy)?FileRoute(\(\s*['"])([^\s]*)(['"],?\s*\))/g,
            (match, p1, p2, p3, p4) =>
              `${node.isLazy ? 'createLazyFileRoute' : 'createFileRoute'}${p2}${escapedRoutePath}${p4}`,
          )
      }

      if (replaced !== routeCode) {
        logger.log(`🟡 Updating ${node.fullPath}`)
        await fsp.writeFile(node.fullPath, replaced)
      }
    }

    if (
      !node.isVirtual &&
      (node.isLoader ||
        node.isComponent ||
        node.isErrorComponent ||
        node.isPendingComponent ||
        node.isLazy)
    ) {
      routePiecesByPath[node.routePath!] =
        routePiecesByPath[node.routePath!] || {}

      routePiecesByPath[node.routePath!]![
        node.isLazy
          ? 'lazy'
          : node.isLoader
            ? 'loader'
            : node.isErrorComponent
              ? 'errorComponent'
              : node.isPendingComponent
                ? 'pendingComponent'
                : 'component'
      ] = node

      const anchorRoute = routeNodes.find((d) => d.routePath === node.routePath)

      if (!anchorRoute) {
        await handleNode({
          ...node,
          isVirtual: true,
          isLazy: false,
          isLoader: false,
          isComponent: false,
          isErrorComponent: false,
          isPendingComponent: false,
        })
      }
      return
    }

    const cleanedPathIsEmpty = (node.cleanedPath || '').length === 0
    const nonPathRoute = node.isRoute && node.isNonPath
    node.isVirtualParentRequired =
      node.isLayout || nonPathRoute ? !cleanedPathIsEmpty : false
    if (!node.isVirtual && node.isVirtualParentRequired) {
      const parentRoutePath = removeLastSegmentFromPath(node.routePath) || '/'
      const parentVariableName = routePathToVariable(parentRoutePath)

      const anchorRoute = routeNodes.find(
        (d) => d.routePath === parentRoutePath,
      )

      if (!anchorRoute) {
        const parentNode = {
          ...node,
          path: removeLastSegmentFromPath(node.path) || '/',
          filePath: removeLastSegmentFromPath(node.filePath) || '/',
          fullPath: removeLastSegmentFromPath(node.fullPath) || '/',
          routePath: parentRoutePath,
          variableName: parentVariableName,
          isVirtual: true,
          isLayout: false,
          isVirtualParentRoute: true,
          isVirtualParentRequired: false,
        }

        parentNode.children = parentNode.children ?? []
        parentNode.children.push(node)

        node.parent = parentNode

        if (node.isLayout) {
          // since `node.path` is used as the `id` on the route definition, we need to update it
          node.path = determineNodePath(node)
        }

        await handleNode(parentNode)
      } else {
        anchorRoute.children = anchorRoute.children ?? []
        anchorRoute.children.push(node)

        node.parent = anchorRoute
      }
    }

    if (node.parent) {
      if (!node.isVirtualParentRequired) {
        node.parent.children = node.parent.children ?? []
        node.parent.children.push(node)
      }
    } else {
      routeTree.push(node)
    }

    routeNodes.push(node)
  }

  for (const node of preRouteNodes) {
    await handleNode(node)
  }

  function buildRouteConfig(nodes: Array<RouteNode>, depth = 1): string {
    const children = nodes.map((node) => {
      if (node.isRoot) {
        return
      }

      if (node.isLayout && !node.children?.length) {
        return
      }

      const route = `${node.variableName}Route`

      if (node.children?.length) {
        const childConfigs = buildRouteConfig(node.children, depth + 1)
        return `${route}: ${route}.addChildren({${spaces(depth * 4)}${childConfigs}})`
      }

      return route
    })

    return children.filter(Boolean).join(`,`)
  }

  const routeConfigChildrenText = buildRouteConfig(routeTree)

  const sortedRouteNodes = multiSortBy(routeNodes, [
    (d) => (d.routePath?.includes(`/${rootPathId}`) ? -1 : 1),
    (d) => d.routePath?.split('/').length,
    (d) => (d.routePath?.endsWith("index'") ? -1 : 1),
    (d) => d,
  ])

  const imports = Object.entries({
    createFileRoute: sortedRouteNodes.some((d) => d.isVirtual),
    lazyFn: sortedRouteNodes.some(
      (node) => routePiecesByPath[node.routePath!]?.loader,
    ),
    lazyRouteComponent: sortedRouteNodes.some(
      (node) =>
        routePiecesByPath[node.routePath!]?.component ||
        routePiecesByPath[node.routePath!]?.errorComponent ||
        routePiecesByPath[node.routePath!]?.pendingComponent,
    ),
  })
    .filter((d) => d[1])
    .map((d) => d[0])

  const virtualRouteNodes = sortedRouteNodes.filter((d) => d.isVirtual)
  const rootPathIdExtension =
    config.addExtensions && rootRouteNode
      ? path.extname(rootRouteNode.filePath)
      : ''

  const routeImports = [
    ...config.routeTreeFileHeader,
    '// This file is auto-generated by TanStack Router',
    imports.length
      ? `import { ${imports.join(', ')} } from '@tanstack/react-router'\n`
      : '',
    '// Import Routes',
    [
      `import { Route as rootRoute } from './${replaceBackslash(
        path.relative(
          path.dirname(config.generatedRouteTree),
          path.resolve(
            config.routesDirectory,
            `${routePathIdPrefix}${rootPathId}${rootPathIdExtension}`,
          ),
        ),
      )}'`,
      ...sortedRouteNodes
        .filter((d) => !d.isVirtual)
        .map((node) => {
          return `import { Route as ${
            node.variableName
          }Import } from './${replaceBackslash(
            removeExt(
              path.relative(
                path.dirname(config.generatedRouteTree),
                path.resolve(config.routesDirectory, node.filePath),
              ),
              config.addExtensions,
            ),
          )}'`
        }),
    ].join('\n'),
    virtualRouteNodes.length ? '// Create Virtual Routes' : '',
    virtualRouteNodes
      .map((node) => {
        return `const ${
          node.variableName
        }Import = createFileRoute('${removeTrailingUnderscores(
          node.routePath,
        )}')()`
      })
      .join('\n'),
    '// Create/Update Routes',
    sortedRouteNodes
      .map((node) => {
        const loaderNode = routePiecesByPath[node.routePath!]?.loader
        const componentNode = routePiecesByPath[node.routePath!]?.component
        const errorComponentNode =
          routePiecesByPath[node.routePath!]?.errorComponent
        const pendingComponentNode =
          routePiecesByPath[node.routePath!]?.pendingComponent
        const lazyComponentNode = routePiecesByPath[node.routePath!]?.lazy

        return [
          `const ${node.variableName}Route = ${node.variableName}Import.update({
          ${[
            node.isNonPath
              ? `id: '${node.path}'`
              : `path: '${node.cleanedPath}'`,
            `getParentRoute: () => ${node.parent?.variableName ?? 'root'}Route`,
          ]
            .filter(Boolean)
            .join(',')}
        }${config.disableTypes ? '' : 'as any'})`,
          loaderNode
            ? `.updateLoader({ loader: lazyFn(() => import('./${replaceBackslash(
                removeExt(
                  path.relative(
                    path.dirname(config.generatedRouteTree),
                    path.resolve(config.routesDirectory, loaderNode.filePath),
                  ),
                  config.addExtensions,
                ),
              )}'), 'loader') })`
            : '',
          componentNode || errorComponentNode || pendingComponentNode
            ? `.update({
              ${(
                [
                  ['component', componentNode],
                  ['errorComponent', errorComponentNode],
                  ['pendingComponent', pendingComponentNode],
                ] as const
              )
                .filter((d) => d[1])
                .map((d) => {
                  return `${
                    d[0]
                  }: lazyRouteComponent(() => import('./${replaceBackslash(
                    removeExt(
                      path.relative(
                        path.dirname(config.generatedRouteTree),
                        path.resolve(config.routesDirectory, d[1]!.filePath),
                      ),
                      config.addExtensions,
                    ),
                  )}'), '${d[0]}')`
                })
                .join('\n,')}
            })`
            : '',
          lazyComponentNode
            ? `.lazy(() => import('./${replaceBackslash(
                removeExt(
                  path.relative(
                    path.dirname(config.generatedRouteTree),
                    path.resolve(
                      config.routesDirectory,
                      lazyComponentNode.filePath,
                    ),
                  ),
                  config.addExtensions,
                ),
              )}').then((d) => d.Route))`
            : '',
        ].join('')
      })
      .join('\n\n'),
    ...(config.disableTypes
      ? []
      : [
          '// Populate the FileRoutesByPath interface',
          `declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    ${routeNodes
      .map((routeNode) => {
        const [filePathId, routeId] = getFilePathIdAndRouteIdFromPath(
          routeNode.routePath!,
        )

        return `'${filePathId}': {
          id: '${routeId}'
          path: '${inferPath(routeNode)}'
          fullPath: '${inferFullPath(routeNode)}'
          preLoaderRoute: typeof ${routeNode.variableName}Import
          parentRoute: typeof ${
            routeNode.isVirtualParentRequired
              ? `${routeNode.parent?.variableName}Route`
              : routeNode.parent?.variableName
                ? `${routeNode.parent.variableName}Import`
                : 'rootRoute'
          }
        }`
      })
      .join('\n')}
  }
}`,
        ]),
    '// Create and export the route tree',
    `export const routeTree = rootRoute.addChildren({${routeConfigChildrenText}})`,
    ...config.routeTreeFileFooter,
  ]
    .filter(Boolean)
    .join('\n\n')

  const createRouteManifest = () =>
    JSON.stringify(
      {
        routes: {
          __root__: {
            filePath: rootRouteNode?.filePath,
            children: routeTree.map(
              (d) => getFilePathIdAndRouteIdFromPath(d.routePath!)[1],
            ),
          },
          ...Object.fromEntries(
            routeNodes.map((d) => {
              const [filePathId, routeId] = getFilePathIdAndRouteIdFromPath(
                d.routePath!,
              )

              return [
                routeId,
                {
                  filePath: d.filePath,
                  parent: d.parent?.routePath
                    ? getFilePathIdAndRouteIdFromPath(d.parent.routePath)[1]
                    : undefined,
                  children: d.children?.map(
                    (childRoute) =>
                      getFilePathIdAndRouteIdFromPath(childRoute.routePath!)[1],
                  ),
                },
              ]
            }),
          ),
        },
      },
      null,
      2,
    )

  const routeConfigFileContent = await prettier.format(
    config.disableManifestGeneration
      ? routeImports
      : [
          routeImports,
          '\n',
          '/* ROUTE_MANIFEST_START',
          createRouteManifest(),
          'ROUTE_MANIFEST_END */',
        ].join('\n'),
    {
      semi: config.semicolons,
      singleQuote: config.quoteStyle === 'single',
      parser: 'typescript',
    },
  )

  if (!checkLatest()) return

  const existingRouteTreeContent = await fsp
    .readFile(path.resolve(config.generatedRouteTree), 'utf-8')
    .catch((err) => {
      if (err.code === 'ENOENT') {
        return ''
      }

      throw err
    })

  if (!checkLatest()) return

  // Ensure the directory exists
  await fsp.mkdir(path.dirname(path.resolve(config.generatedRouteTree)), {
    recursive: true,
  })

  if (!checkLatest()) return

  // Write the route tree file, if it has changed
  if (existingRouteTreeContent !== routeConfigFileContent) {
    await fsp.writeFile(
      path.resolve(config.generatedRouteTree),
      routeConfigFileContent,
    )
    if (!checkLatest()) return
  }

  logger.log(
    `✅ Processed ${routeNodes.length === 1 ? 'route' : 'routes'} in ${
      Date.now() - start
    }ms`,
  )
}

function routePathToVariable(routePath: string): string {
  return (
    removeUnderscores(routePath)
      ?.replace(/\/\$\//g, '/splat/')
      .replace(/\$$/g, 'splat')
      .replace(/\$/g, '')
      .split(/[/-]/g)
      .map((d, i) => (i > 0 ? capitalize(d) : d))
      .join('')
      .replace(/([^a-zA-Z0-9]|[.])/gm, '')
      .replace(/^(\d)/g, 'R$1') ?? ''
  )
}

export function removeExt(d: string, keepExtension: boolean = false) {
  return keepExtension ? d : d.substring(0, d.lastIndexOf('.')) || d
}

function spaces(d: number): string {
  return Array.from({ length: d })
    .map(() => ' ')
    .join('')
}

export function multiSortBy<T>(
  arr: Array<T>,
  accessors: Array<(item: T) => any> = [(d) => d],
): Array<T> {
  return arr
    .map((d, i) => [d, i] as const)
    .sort(([a, ai], [b, bi]) => {
      for (const accessor of accessors) {
        const ao = accessor(a)
        const bo = accessor(b)

        if (typeof ao === 'undefined') {
          if (typeof bo === 'undefined') {
            continue
          }
          return 1
        }

        if (ao === bo) {
          continue
        }

        return ao > bo ? 1 : -1
      }

      return ai - bi
    })
    .map(([d]) => d)
}

function capitalize(s: string) {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function removeUnderscores(s?: string) {
  return s?.replaceAll(/(^_|_$)/gi, '').replaceAll(/(\/_|_\/)/gi, '/')
}

function removeTrailingUnderscores(s?: string) {
  return s?.replaceAll(/(_$)/gi, '').replaceAll(/(_\/)/gi, '/')
}

function replaceBackslash(s: string) {
  return s.replaceAll(/\\/gi, '/')
}

function removeGroups(s: string) {
  return s.replace(possiblyNestedRouteGroupPatternRegex, '')
}

/**
 * The `node.path` is used as the `id` in the route definition.
 * This function checks if the given node has a parent and if so, it determines the correct path for the given node.
 * @param node - The node to determine the path for.
 * @returns The correct path for the given node.
 */
function determineNodePath(node: RouteNode) {
  return (node.path = node.parent
    ? node.routePath?.replace(node.parent.routePath!, '') || '/'
    : node.routePath)
}

/**
 * Removes the last segment from a given path. Segments are considered to be separated by a '/'.
 *
 * @param {string} routePath - The path from which to remove the last segment. Defaults to '/'.
 * @returns {string} The path with the last segment removed.
 * @example
 * removeLastSegmentFromPath('/workspace/_auth/foo') // '/workspace/_auth'
 */
export function removeLastSegmentFromPath(routePath: string = '/'): string {
  const segments = routePath.split('/')
  segments.pop() // Remove the last segment
  return segments.join('/')
}

/**
 * Removes all segments from a given path that start with an underscore ('_').
 *
 * @param {string} routePath - The path from which to remove segments. Defaults to '/'.
 * @returns {string} The path with all underscore-prefixed segments removed.
 * @example
 * removeLayoutSegments('/workspace/_auth/foo') // '/workspace/foo'
 */
function removeLayoutSegments(routePath: string = '/'): string {
  const segments = routePath.split('/')
  const newSegments = segments.filter((segment) => !segment.startsWith('_'))
  return newSegments.join('/')
}

export function hasParentRoute(
  routes: Array<RouteNode>,
  node: RouteNode,
  routePathToCheck: string | undefined,
): RouteNode | null {
  if (!routePathToCheck || routePathToCheck === '/') {
    return null
  }

  const sortedNodes = multiSortBy(routes, [
    (d) => d.routePath!.length * -1,
    (d) => d.variableName,
  ]).filter((d) => d.routePath !== `/${rootPathId}`)

  for (const route of sortedNodes) {
    if (route.routePath === '/') continue

    if (
      routePathToCheck.startsWith(`${route.routePath}/`) &&
      route.routePath !== routePathToCheck
    ) {
      return route
    }
  }

  const segments = routePathToCheck.split('/')
  segments.pop() // Remove the last segment
  const parentRoutePath = segments.join('/')

  return hasParentRoute(routes, node, parentRoutePath)
}

/**
 * Infers the full path for use by TS
 */
export const inferFullPath = (routeNode: RouteNode): string => {
  const fullPath = removeGroups(
    removeUnderscores(removeLayoutSegments(routeNode.routePath)) ?? '',
  )

  return routeNode.cleanedPath === '/' ? fullPath : fullPath.replace(/\/$/, '')
}

/**
 * Infers the path for use by TS
 */
export const inferPath = (routeNode: RouteNode): string => {
  return routeNode.cleanedPath === '/'
    ? routeNode.cleanedPath
    : (routeNode.cleanedPath?.replace(/\/$/, '') ?? '')
}

function getFilePathIdAndRouteIdFromPath(pathname: string) {
  const filePathId = removeTrailingUnderscores(pathname)
  const id = removeGroups(filePathId ?? '')

  return [filePathId, id] as const
}
