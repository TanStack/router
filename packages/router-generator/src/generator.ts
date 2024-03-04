import path from 'path'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as prettier from 'prettier'
import { Config } from './config'
import { cleanPath, logging, trimPathLeft } from './utils'

let latestTask = 0
export const rootPathId = '__root'
const routeGroupPatternRegex = /\(.+\)/g

export type RouteNode = {
  filePath: string
  fullPath: string
  variableName: string
  routePath?: string
  cleanedPath?: string
  path?: string
  isNonPath?: boolean
  isNonLayout?: boolean
  isRoute?: boolean
  isLoader?: boolean
  isComponent?: boolean
  isErrorComponent?: boolean
  isPendingComponent?: boolean
  isVirtual?: boolean
  isLazy?: boolean
  isRoot?: boolean
  children?: RouteNode[]
  parent?: RouteNode
}

async function getRouteNodes(config: Config) {
  const { routeFilePrefix, routeFileIgnorePrefix } = config
  const logger = logging({ disabled: config.disableLogging })

  let routeNodes: RouteNode[] = []

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

          const variableName = routePathToVariable(routePath)

          // Remove the index from the route path and
          // if the route path is empty, use `/'

          let isLazy = routePath?.endsWith('/lazy')

          if (isLazy) {
            routePath = routePath?.replace(/\/lazy$/, '')
          }

          let isRoute = routePath?.endsWith('/route')
          let isComponent = routePath?.endsWith('/component')
          let isErrorComponent = routePath?.endsWith('/errorComponent')
          let isPendingComponent = routePath?.endsWith('/pendingComponent')
          let isLoader = routePath?.endsWith('/loader')

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

          routePath = routePath?.replace(
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
          })
        }
      }),
    )

    return routeNodes
  }

  await recurse('./')

  return routeNodes
}

let first = false
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

  if (!first) {
    logger.log('♻️  Generating routes...')
    first = true
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
    (d) => (d.filePath?.match(/[./]index[.]/) ? 1 : -1),
    (d) =>
      d.filePath?.match(
        /[./](component|errorComponent|pendingComponent|loader|lazy)[.]/,
      )
        ? 1
        : -1,
    (d) => (d.filePath?.match(/[./]route[.]/) ? -1 : 1),
    (d) => (d.routePath?.endsWith('/') ? -1 : 1),
    (d) => d.routePath,
  ]).filter((d) => ![`/${rootPathId}`].includes(d.routePath || ''))

  const routeTree: RouteNode[] = []
  const routePiecesByPath: Record<string, RouteSubNode> = {}

  // Loop over the flat list of routeNodes and
  // build up a tree based on the routeNodes' routePath
  let routeNodes: RouteNode[] = []

  const handleNode = async (node: RouteNode) => {
    const parentRoute = hasParentRoute(routeNodes, node.routePath)
    if (parentRoute) node.parent = parentRoute

    node.path = node.parent
      ? node.routePath?.replace(node.parent.routePath!, '') || '/'
      : node.routePath

    const trimmedPath = trimPathLeft(node.path ?? '')

    const split = trimmedPath?.split('/') ?? []
    let first = split[0] ?? trimmedPath ?? ''

    node.isNonPath = first.startsWith('_')
    node.isNonLayout = first.endsWith('_')
    node.cleanedPath = removeGroups(removeUnderscores(node.path) ?? '')

    // Ensure the boilerplate for the route exists
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
          /(createFileRoute\(\s*['"])([^\s]*)(['"],?\s*\))/g,
          (match, p1, p2, p3) => `${p1}${escapedRoutePath}${p3}`,
        )
        .replace(
          /(createLazyFileRoute\(\s*['"])([^\s]*)(['"],?\s*\))/g,
          (match, p1, p2, p3) => `${p1}${escapedRoutePath}${p3}`,
        )
    }

    if (replaced !== routeCode) {
      logger.log(`🟡 Updating ${node.fullPath}`)
      await fsp.writeFile(node.fullPath, replaced)
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

    if (node.parent) {
      node.parent.children = node.parent.children ?? []
      node.parent.children.push(node)
    } else {
      routeTree.push(node)
    }

    routeNodes.push(node)
  }

  await Promise.all(preRouteNodes.map((node) => handleNode(node)))

  async function buildRouteConfig(
    nodes: RouteNode[],
    depth = 1,
  ): Promise<string> {
    const children = nodes.map(async (node) => {
      if (node.isRoot) {
        return
      }

      const route = `${node.variableName}Route`

      if (node.children?.length) {
        const childConfigs = await buildRouteConfig(node.children, depth + 1)
        return `${route}.addChildren([${spaces(depth * 4)}${childConfigs}])`
      }

      return route
    })

    return (await Promise.all(children)).filter(Boolean).join(`,`)
  }

  const routeConfigChildrenText = await buildRouteConfig(routeTree)

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
    '/* prettier-ignore-start */',
    '/* eslint-disable */',
    '// @ts-nocheck',
    '// noinspection JSUnusedGlobalSymbols',
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
                      lazyComponentNode!.filePath,
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
        return `'${removeTrailingUnderscores(routeNode.routePath)}': {
          preLoaderRoute: typeof ${routeNode.variableName}Import
          parentRoute: typeof ${
            routeNode.parent?.variableName
              ? `${routeNode.parent?.variableName}Import`
              : 'rootRoute'
          }
        }`
      })
      .join('\n')}
  }
}`,
        ]),
    '// Create and export the route tree',
    `export const routeTree = rootRoute.addChildren([${routeConfigChildrenText}])`,
    '/* prettier-ignore-end */',
  ]
    .filter(Boolean)
    .join('\n\n')

  const routeConfigFileContent = await prettier.format(routeImports, {
    semi: false,
    singleQuote: config.quoteStyle === 'single',
    parser: 'typescript',
  })

  const routeTreeContent = await fsp
    .readFile(path.resolve(config.generatedRouteTree), 'utf-8')
    .catch((err: any) => {
      if (err.code === 'ENOENT') {
        return undefined
      }
      throw err
    })

  if (!checkLatest()) return

  if (routeTreeContent !== routeConfigFileContent) {
    await fsp.mkdir(path.dirname(path.resolve(config.generatedRouteTree)), {
      recursive: true,
    })
    if (!checkLatest()) return
    await fsp.writeFile(
      path.resolve(config.generatedRouteTree),
      routeConfigFileContent,
    )
  }

  logger.log(
    `✅ Processed ${routeNodes.length === 1 ? 'route' : 'routes'} in ${
      Date.now() - start
    }ms`,
  )
}

function routePathToVariable(d: string): string {
  return (
    removeUnderscores(d)
      ?.replace(/\/\$\//g, '/splat/')
      ?.replace(/\$$/g, 'splat')
      ?.replace(/\$/g, '')
      ?.split(/[/-]/g)
      .map((d, i) => (i > 0 ? capitalize(d) : d))
      .join('')
      .replace(/([^a-zA-Z0-9]|[\.])/gm, '')
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
  arr: T[],
  accessors: ((item: T) => any)[] = [(d) => d],
): T[] {
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
  return s.replaceAll(routeGroupPatternRegex, '').replaceAll('//', '/')
}

export function hasParentRoute(
  routes: RouteNode[],
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

  return hasParentRoute(routes, parentRoutePath)
}
