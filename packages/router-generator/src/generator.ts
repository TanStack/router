import path from 'node:path'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import {
  determineInitialRoutePath,
  format,
  logging,
  multiSortBy,
  removeExt,
  removeTrailingSlash,
  removeUnderscores,
  replaceBackslash,
  resetRegex,
  routePathToVariable,
  trimPathLeft,
  writeIfDifferent,
} from './utils'
import { getRouteNodes as physicalGetRouteNodes } from './filesystem/physical/getRouteNodes'
import { getRouteNodes as virtualGetRouteNodes } from './filesystem/virtual/getRouteNodes'
import { rootPathId } from './filesystem/physical/rootPathId'
import {
  defaultAPIRouteTemplate,
  fillTemplate,
  getTargetTemplate,
} from './template'
import type { FsRouteType, GetRouteNodesResult, RouteNode } from './types'
import type { Config } from './config'

export const CONSTANTS = {
  // When changing this, you'll want to update the import in `start-api-routes/src/index.ts#defaultAPIFileRouteHandler`
  APIRouteExportVariable: 'APIRoute',
}

let latestTask = 0
const routeGroupPatternRegex = /\(.+\)/g
const possiblyNestedRouteGroupPatternRegex = /\([^/]+\)\/?/g

let isFirst = false
let skipMessage = false

type RouteSubNode = {
  component?: RouteNode
  errorComponent?: RouteNode
  pendingComponent?: RouteNode
  loader?: RouteNode
  lazy?: RouteNode
}

export async function generator(config: Config, root: string) {
  const ROUTE_TEMPLATE = getTargetTemplate(config.target)
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

  const TYPES_DISABLED = config.disableTypes

  // Controls whether API Routes are generated for TanStack Start
  const ENABLED_API_ROUTES_GENERATION =
    config.__enableAPIRoutesGeneration ?? false

  let getRouteNodesResult: GetRouteNodesResult

  if (config.virtualRouteConfig) {
    getRouteNodesResult = await virtualGetRouteNodes(config, root)
  } else {
    getRouteNodesResult = await physicalGetRouteNodes(config, root)
  }

  const { rootRouteNode, routeNodes: beforeRouteNodes } = getRouteNodesResult
  if (rootRouteNode === undefined) {
    let errorMessage = `rootRouteNode must not be undefined. Make sure you've added your root route into the route-tree.`
    if (!config.virtualRouteConfig) {
      errorMessage += `\nMake sure that you add a "${rootPathId}.${config.disableTypes ? 'js' : 'tsx'}" file to your routes directory.\nAdd the file in: "${config.routesDirectory}/${rootPathId}.${config.disableTypes ? 'js' : 'tsx'}"`
    }
    throw new Error(errorMessage)
  }

  const preRouteNodes = multiSortBy(beforeRouteNodes, [
    (d) => (d.routePath === '/' ? -1 : 1),
    (d) => d.routePath?.split('/').length,
    (d) =>
      d.filePath.match(new RegExp(`[./]${config.indexToken}[.]`)) ? 1 : -1,
    (d) =>
      d.filePath.match(
        /[./](component|errorComponent|pendingComponent|loader|lazy)[.]/,
      )
        ? 1
        : -1,
    (d) =>
      d.filePath.match(new RegExp(`[./]${config.routeToken}[.]`)) ? -1 : 1,
    (d) => (d.routePath?.endsWith('/') ? -1 : 1),
    (d) => d.routePath,
  ]).filter((d) => ![`/${rootPathId}`].includes(d.routePath || ''))

  const routeTree: Array<RouteNode> = []
  const routePiecesByPath: Record<string, RouteSubNode> = {}

  // Filtered API Route nodes
  const onlyAPIRouteNodes = preRouteNodes.filter((d) => {
    if (!ENABLED_API_ROUTES_GENERATION) {
      return false
    }

    if (d._fsRouteType !== 'api') {
      return false
    }

    return true
  })

  // Filtered Generator Route nodes
  const onlyGeneratorRouteNodes = preRouteNodes.filter((d) => {
    if (ENABLED_API_ROUTES_GENERATION) {
      if (d._fsRouteType === 'api') {
        return false
      }
    }

    return true
  })

  // Loop over the flat list of routeNodes and
  // build up a tree based on the routeNodes' routePath
  const routeNodes: Array<RouteNode> = []

  // the handleRootNode function is not being collapsed into the handleNode function
  // because it requires only a subset of the logic that the handleNode function requires
  // and it's easier to read and maintain this way
  const handleRootNode = async (node?: RouteNode) => {
    if (!node) {
      // currently this is not being handled, but it could be in the future
      // for example to handle a virtual root route
      return
    }

    // from here on, we are only handling the root node that's present in the file system
    const routeCode = fs.readFileSync(node.fullPath, 'utf-8')

    if (!routeCode) {
      const _rootTemplate = ROUTE_TEMPLATE.rootRoute
      const replaced = await fillTemplate(config, _rootTemplate.template(), {
        tsrImports: _rootTemplate.imports.tsrImports(),
        tsrPath: rootPathId,
        tsrExportStart: _rootTemplate.imports.tsrExportStart(),
        tsrExportEnd: _rootTemplate.imports.tsrExportEnd(),
      })

      await writeIfDifferent(
        node.fullPath,
        '', // Empty string because the file doesn't exist yet
        replaced,
        {
          beforeWrite: () => {
            logger.log(`🟡 Creating ${node.fullPath}`)
          },
        },
      )
    }
  }

  await handleRootNode(rootRouteNode)

  const handleNode = async (node: RouteNode) => {
    // Do not remove this as we need to set the lastIndex to 0 as it
    // is necessary to reset the regex's index when using the global flag
    // otherwise it might not match the next time it's used
    resetRegex(routeGroupPatternRegex)

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
    const lastRouteSegment = split[split.length - 1] ?? trimmedPath

    node.isNonPath =
      lastRouteSegment.startsWith('_') ||
      routeGroupPatternRegex.test(lastRouteSegment)

    node.cleanedPath = removeGroups(
      removeUnderscores(removeLayoutSegments(node.path)) ?? '',
    )

    // Ensure the boilerplate for the route exists, which can be skipped for virtual parent routes and virtual routes
    if (!node.isVirtualParentRoute && !node.isVirtual) {
      const routeCode = fs.readFileSync(node.fullPath, 'utf-8')

      const escapedRoutePath = node.routePath?.replaceAll('$', '$$') ?? ''

      let replaced = routeCode

      const tRouteTemplate = ROUTE_TEMPLATE.route
      const tLazyRouteTemplate = ROUTE_TEMPLATE.lazyRoute

      if (!routeCode) {
        // Creating a new lazy route file
        if (node._fsRouteType === 'lazy') {
          // Check by default check if the user has a specific lazy route template
          // If not, check if the user has a route template and use that instead
          replaced = await fillTemplate(
            config,
            (config.customScaffolding?.lazyRouteTemplate ||
              config.customScaffolding?.routeTemplate) ??
              tLazyRouteTemplate.template(),
            {
              tsrImports: tLazyRouteTemplate.imports.tsrImports(),
              tsrPath: escapedRoutePath,
              tsrExportStart:
                tLazyRouteTemplate.imports.tsrExportStart(escapedRoutePath),
              tsrExportEnd: tLazyRouteTemplate.imports.tsrExportEnd(),
            },
          )
        } else if (
          // Creating a new normal route file
          (['layout', 'static'] satisfies Array<FsRouteType>).some(
            (d) => d === node._fsRouteType,
          ) ||
          (
            [
              'component',
              'pendingComponent',
              'errorComponent',
              'loader',
            ] satisfies Array<FsRouteType>
          ).every((d) => d !== node._fsRouteType)
        ) {
          replaced = await fillTemplate(
            config,
            config.customScaffolding?.routeTemplate ??
              tRouteTemplate.template(),
            {
              tsrImports: tRouteTemplate.imports.tsrImports(),
              tsrPath: escapedRoutePath,
              tsrExportStart:
                tRouteTemplate.imports.tsrExportStart(escapedRoutePath),
              tsrExportEnd: tRouteTemplate.imports.tsrExportEnd(),
            },
          )
        }
      } else {
        // Update the existing route file
        replaced = routeCode
          .replace(
            /(FileRoute\(\s*['"])([^\s]*)(['"],?\s*\))/g,
            (_, p1, __, p3) => `${p1}${escapedRoutePath}${p3}`,
          )
          .replace(
            new RegExp(
              `(import\\s*\\{.*)(create(Lazy)?FileRoute)(.*\\}\\s*from\\s*['"]@tanstack\\/${ROUTE_TEMPLATE.subPkg}['"])`,
              'gs',
            ),
            (_, p1, __, ___, p4) =>
              `${p1}${node._fsRouteType === 'lazy' ? 'createLazyFileRoute' : 'createFileRoute'}${p4}`,
          )
          .replace(
            /create(Lazy)?FileRoute(\(\s*['"])([^\s]*)(['"],?\s*\))/g,
            (_, __, p2, ___, p4) =>
              `${node._fsRouteType === 'lazy' ? 'createLazyFileRoute' : 'createFileRoute'}${p2}${escapedRoutePath}${p4}`,
          )
      }

      await writeIfDifferent(node.fullPath, routeCode, replaced, {
        beforeWrite: () => {
          logger.log(`🟡 Updating ${node.fullPath}`)
        },
      })
    }

    if (
      !node.isVirtual &&
      (
        [
          'lazy',
          'loader',
          'component',
          'pendingComponent',
          'errorComponent',
        ] satisfies Array<FsRouteType>
      ).some((d) => d === node._fsRouteType)
    ) {
      routePiecesByPath[node.routePath!] =
        routePiecesByPath[node.routePath!] || {}

      routePiecesByPath[node.routePath!]![
        node._fsRouteType === 'lazy'
          ? 'lazy'
          : node._fsRouteType === 'loader'
            ? 'loader'
            : node._fsRouteType === 'errorComponent'
              ? 'errorComponent'
              : node._fsRouteType === 'pendingComponent'
                ? 'pendingComponent'
                : 'component'
      ] = node

      const anchorRoute = routeNodes.find((d) => d.routePath === node.routePath)

      if (!anchorRoute) {
        await handleNode({
          ...node,
          isVirtual: true,
          _fsRouteType: 'static',
        })
      }
      return
    }

    const cleanedPathIsEmpty = (node.cleanedPath || '').length === 0
    const nonPathRoute =
      node._fsRouteType === 'pathless_layout' && node.isNonPath

    node.isVirtualParentRequired =
      node._fsRouteType === 'pathless_layout' || nonPathRoute
        ? !cleanedPathIsEmpty
        : false

    if (!node.isVirtual && node.isVirtualParentRequired) {
      const parentRoutePath = removeLastSegmentFromPath(node.routePath) || '/'
      const parentVariableName = routePathToVariable(parentRoutePath)

      const anchorRoute = routeNodes.find(
        (d) => d.routePath === parentRoutePath,
      )

      if (!anchorRoute) {
        const parentNode: RouteNode = {
          ...node,
          path: removeLastSegmentFromPath(node.path) || '/',
          filePath: removeLastSegmentFromPath(node.filePath) || '/',
          fullPath: removeLastSegmentFromPath(node.fullPath) || '/',
          routePath: parentRoutePath,
          variableName: parentVariableName,
          isVirtual: true,
          _fsRouteType: 'layout', // layout since this route will wrap other routes
          isVirtualParentRoute: true,
          isVirtualParentRequired: false,
        }

        parentNode.children = parentNode.children ?? []
        parentNode.children.push(node)

        node.parent = parentNode

        if (node._fsRouteType === 'pathless_layout') {
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

  for (const node of onlyGeneratorRouteNodes) {
    await handleNode(node)
  }
  checkRouteFullPathUniqueness(
    preRouteNodes.filter(
      (d) =>
        d.children === undefined &&
        (['api', 'lazy'] satisfies Array<FsRouteType>).every(
          (type) => type !== d._fsRouteType,
        ),
    ),
    config,
  )

  const startAPIRouteNodes: Array<RouteNode> = checkStartAPIRoutes(
    onlyAPIRouteNodes,
    config,
  )

  const handleAPINode = async (node: RouteNode) => {
    const routeCode = fs.readFileSync(node.fullPath, 'utf-8')

    const escapedRoutePath = node.routePath?.replaceAll('$', '$$') ?? ''

    if (!routeCode) {
      const replaced = await fillTemplate(
        config,
        config.customScaffolding?.apiTemplate ?? defaultAPIRouteTemplate,
        {
          tsrImports:
            "import { createAPIFileRoute } from '@tanstack/react-start/api';",
          tsrPath: escapedRoutePath,
          tsrExportStart: `export const ${CONSTANTS.APIRouteExportVariable} = createAPIFileRoute('${escapedRoutePath}')(`,
          tsrExportEnd: ');',
        },
      )

      await writeIfDifferent(
        node.fullPath,
        '', // Empty string because the file doesn't exist yet
        replaced,
        {
          beforeWrite: () => {
            logger.log(`🟡 Creating ${node.fullPath}`)
          },
        },
      )
    } else {
      await writeIfDifferent(
        node.fullPath,
        routeCode,
        routeCode.replace(
          /(createAPIFileRoute\(\s*['"])([^\s]*)(['"],?\s*\))/g,
          (_, p1, __, p3) => `${p1}${escapedRoutePath}${p3}`,
        ),
        {
          beforeWrite: () => {
            logger.log(`🟡 Updating ${node.fullPath}`)
          },
        },
      )
    }
  }

  // Handle the API routes for TanStack Start
  if (ENABLED_API_ROUTES_GENERATION) {
    for (const node of startAPIRouteNodes) {
      await handleAPINode(node)
    }
  }

  function buildRouteTreeConfig(nodes: Array<RouteNode>, depth = 1): string {
    const children = nodes.map((node) => {
      if (node._fsRouteType === '__root') {
        return
      }

      if (node._fsRouteType === 'pathless_layout' && !node.children?.length) {
        return
      }

      const route = `${node.variableName}Route`

      if (node.children?.length) {
        const childConfigs = buildRouteTreeConfig(node.children, depth + 1)

        const childrenDeclaration = TYPES_DISABLED
          ? ''
          : `interface ${route}Children {
  ${node.children.map((child) => `${child.variableName}Route: typeof ${getResolvedRouteNodeVariableName(child)}`).join(',')}
}`

        const children = `const ${route}Children${TYPES_DISABLED ? '' : `: ${route}Children`} = {
  ${node.children.map((child) => `${child.variableName}Route: ${getResolvedRouteNodeVariableName(child)}`).join(',')}
}`

        const routeWithChildren = `const ${route}WithChildren = ${route}._addFileChildren(${route}Children)`

        return [
          childConfigs,
          childrenDeclaration,
          children,
          routeWithChildren,
        ].join('\n\n')
      }

      return undefined
    })

    return children.filter(Boolean).join('\n\n')
  }

  const routeConfigChildrenText = buildRouteTreeConfig(routeTree)

  const sortedRouteNodes = multiSortBy(routeNodes, [
    (d) => (d.routePath?.includes(`/${rootPathId}`) ? -1 : 1),
    (d) => d.routePath?.split('/').length,
    (d) => (d.routePath?.endsWith(config.indexToken) ? -1 : 1),
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

  function getImportPath(node: RouteNode) {
    return replaceBackslash(
      removeExt(
        path.relative(
          path.dirname(config.generatedRouteTree),
          path.resolve(config.routesDirectory, node.filePath),
        ),
        config.addExtensions,
      ),
    )
  }
  const routeImports = [
    ...config.routeTreeFileHeader,
    `// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.`,
    imports.length
      ? `import { ${imports.join(', ')} } from '${ROUTE_TEMPLATE.fullPkg}'\n`
      : '',
    '// Import Routes',
    [
      `import { Route as rootRoute } from './${getImportPath(rootRouteNode)}'`,
      ...sortedRouteNodes
        .filter((d) => !d.isVirtual)
        .map((node) => {
          return `import { Route as ${
            node.variableName
          }Import } from './${getImportPath(node)}'`
        }),
    ].join('\n'),
    virtualRouteNodes.length ? '// Create Virtual Routes' : '',
    virtualRouteNodes
      .map((node) => {
        return `const ${
          node.variableName
        }Import = createFileRoute('${node.routePath}')()`
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
            `id: '${node.path}'`,
            !node.isNonPath ? `path: '${node.cleanedPath}'` : undefined,
            `getParentRoute: () => ${node.parent?.variableName ?? 'root'}Route`,
          ]
            .filter(Boolean)
            .join(',')}
        }${TYPES_DISABLED ? '' : 'as any'})`,
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
    ...(TYPES_DISABLED
      ? []
      : [
          '// Populate the FileRoutesByPath interface',
          `declare module '${ROUTE_TEMPLATE.fullPkg}' {
  interface FileRoutesByPath {
    ${routeNodes
      .map((routeNode) => {
        const filePathId = routeNode.routePath

        return `'${filePathId}': {
          id: '${filePathId}'
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
    routeConfigChildrenText,
    ...(TYPES_DISABLED
      ? []
      : [
          `export interface FileRoutesByFullPath {
  ${[...createRouteNodesByFullPath(routeNodes).entries()].map(
    ([fullPath, routeNode]) => {
      return `'${fullPath}': typeof ${getResolvedRouteNodeVariableName(routeNode)}`
    },
  )}
}`,
          `export interface FileRoutesByTo {
  ${[...createRouteNodesByTo(routeNodes).entries()].map(([to, routeNode]) => {
    return `'${to}': typeof ${getResolvedRouteNodeVariableName(routeNode)}`
  })}
}`,
          `export interface FileRoutesById {
  '__root__': typeof rootRoute,
  ${[...createRouteNodesById(routeNodes).entries()].map(([id, routeNode]) => {
    return `'${id}': typeof ${getResolvedRouteNodeVariableName(routeNode)}`
  })}
}`,
          `export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: ${routeNodes.length > 0 ? [...createRouteNodesByFullPath(routeNodes).keys()].map((fullPath) => `'${fullPath}'`).join('|') : 'never'}
  fileRoutesByTo: FileRoutesByTo
  to: ${routeNodes.length > 0 ? [...createRouteNodesByTo(routeNodes).keys()].map((to) => `'${to}'`).join('|') : 'never'}
  id: ${[`'__root__'`, ...[...createRouteNodesById(routeNodes).keys()].map((id) => `'${id}'`)].join('|')}
  fileRoutesById: FileRoutesById
}`,
          `export interface RootRouteChildren {
  ${routeTree.map((child) => `${child.variableName}Route: typeof ${getResolvedRouteNodeVariableName(child)}`).join(',')}
}`,
        ]),
    `const rootRouteChildren${TYPES_DISABLED ? '' : ': RootRouteChildren'} = {
  ${routeTree.map((child) => `${child.variableName}Route: ${getResolvedRouteNodeVariableName(child)}`).join(',')}
}`,
    `export const routeTree = rootRoute._addFileChildren(rootRouteChildren)${TYPES_DISABLED ? '' : '._addFileTypes<FileRouteTypes>()'}`,
    ...config.routeTreeFileFooter,
  ]
    .filter(Boolean)
    .join('\n\n')

  const createRouteManifest = () => {
    const routesManifest = {
      __root__: {
        filePath: rootRouteNode.filePath,
        children: routeTree.map((d) => d.routePath),
      },
      ...Object.fromEntries(
        routeNodes.map((d) => {
          const filePathId = d.routePath

          return [
            filePathId,
            {
              filePath: d.filePath,
              parent: d.parent?.routePath ? d.parent.routePath : undefined,
              children: d.children?.map((childRoute) => childRoute.routePath),
            },
          ]
        }),
      ),
    }

    return JSON.stringify(
      {
        routes: routesManifest,
      },
      null,
      2,
    )
  }

  const includeManifest = ['react', 'solid']
  const routeConfigFileContent =
    config.disableManifestGeneration || !includeManifest.includes(config.target)
      ? routeImports
      : [
          routeImports,
          '\n',
          '/* ROUTE_MANIFEST_START',
          createRouteManifest(),
          'ROUTE_MANIFEST_END */',
        ].join('\n')

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
  const routeTreeWriteResult = await writeIfDifferent(
    path.resolve(config.generatedRouteTree),
    config.enableRouteTreeFormatting
      ? await format(existingRouteTreeContent, config)
      : existingRouteTreeContent,
    config.enableRouteTreeFormatting
      ? await format(routeConfigFileContent, config)
      : routeConfigFileContent,
    {
      beforeWrite: () => {
        logger.log(`🟡 Updating ${config.generatedRouteTree}`)
      },
    },
  )
  if (routeTreeWriteResult && !checkLatest()) {
    return
  }

  logger.log(
    `✅ Processed ${routeNodes.length === 1 ? 'route' : 'routes'} in ${
      Date.now() - start
    }ms`,
  )
}

// function removeTrailingUnderscores(s?: string) {
//   return s?.replaceAll(/(_$)/gi, '').replaceAll(/(_\/)/gi, '/')
// }

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
    ? node.routePath?.replace(node.parent.routePath ?? '', '') || '/'
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
 * Gets the final variable name for a route
 */
export const getResolvedRouteNodeVariableName = (
  routeNode: RouteNode,
): string => {
  return routeNode.children?.length
    ? `${routeNode.variableName}RouteWithChildren`
    : `${routeNode.variableName}Route`
}

/**
 * Creates a map from fullPath to routeNode
 */
export const createRouteNodesByFullPath = (
  routeNodes: Array<RouteNode>,
): Map<string, RouteNode> => {
  return new Map(
    routeNodes.map((routeNode) => [inferFullPath(routeNode), routeNode]),
  )
}

/**
 * Create a map from 'to' to a routeNode
 */
export const createRouteNodesByTo = (
  routeNodes: Array<RouteNode>,
): Map<string, RouteNode> => {
  return new Map(
    dedupeBranchesAndIndexRoutes(routeNodes).map((routeNode) => [
      inferTo(routeNode),
      routeNode,
    ]),
  )
}

/**
 * Create a map from 'id' to a routeNode
 */
export const createRouteNodesById = (
  routeNodes: Array<RouteNode>,
): Map<string, RouteNode> => {
  return new Map(
    routeNodes.map((routeNode) => {
      const id = routeNode.routePath ?? ''
      return [id, routeNode]
    }),
  )
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

/**
 * Infers to path
 */
export const inferTo = (routeNode: RouteNode): string => {
  const fullPath = inferFullPath(routeNode)

  if (fullPath === '/') return fullPath

  return fullPath.replace(/\/$/, '')
}

/**
 * Dedupes branches and index routes
 */
export const dedupeBranchesAndIndexRoutes = (
  routes: Array<RouteNode>,
): Array<RouteNode> => {
  return routes.filter((route) => {
    if (route.children?.find((child) => child.cleanedPath === '/')) return false
    return true
  })
}

function checkUnique<TElement>(routes: Array<TElement>, key: keyof TElement) {
  // Check no two routes have the same `key`
  // if they do, throw an error with the conflicting filePaths
  const keys = routes.map((d) => d[key])
  const uniqueKeys = new Set(keys)
  if (keys.length !== uniqueKeys.size) {
    const duplicateKeys = keys.filter((d, i) => keys.indexOf(d) !== i)
    const conflictingFiles = routes.filter((d) =>
      duplicateKeys.includes(d[key]),
    )
    return conflictingFiles
  }
  return undefined
}

function checkRouteFullPathUniqueness(
  _routes: Array<RouteNode>,
  config: Config,
) {
  const routes = _routes.map((d) => {
    const inferredFullPath = inferFullPath(d)
    return { ...d, inferredFullPath }
  })

  const conflictingFiles = checkUnique(routes, 'inferredFullPath')

  if (conflictingFiles !== undefined) {
    const errorMessage = `Conflicting configuration paths were found for the following route${conflictingFiles.length > 1 ? 's' : ''}: ${conflictingFiles
      .map((p) => `"${p.inferredFullPath}"`)
      .join(', ')}.
Please ensure each route has a unique full path.
Conflicting files: \n ${conflictingFiles.map((d) => path.resolve(config.routesDirectory, d.filePath)).join('\n ')}\n`
    throw new Error(errorMessage)
  }
}

function checkStartAPIRoutes(_routes: Array<RouteNode>, config: Config) {
  if (_routes.length === 0) {
    return []
  }

  // Make sure these are valid URLs
  // Route Groups and Layout Routes aren't being removed since
  // you may want to have an API route that starts with an underscore
  // or be wrapped in parentheses
  const routes = _routes.map((d) => {
    const routePath = removeTrailingSlash(d.routePath ?? '')
    return { ...d, routePath }
  })

  const conflictingFiles = checkUnique(routes, 'routePath')

  if (conflictingFiles !== undefined) {
    const errorMessage = `Conflicting configuration paths were found for the following API route${conflictingFiles.length > 1 ? 's' : ''}: ${conflictingFiles
      .map((p) => `"${p}"`)
      .join(', ')}.
  Please ensure each API route has a unique route path.
Conflicting files: \n ${conflictingFiles.map((d) => path.resolve(config.routesDirectory, d.filePath)).join('\n ')}\n`
    throw new Error(errorMessage)
  }

  return routes
}

export type StartAPIRoutePathSegment = {
  value: string
  type: 'path' | 'param' | 'splat'
}

/**
 * This function takes in a path in the format accepted by TanStack Router
 * and returns an array of path segments that can be used to generate
 * the pathname of the TanStack Start API route.
 *
 * @param src
 * @returns
 */
export function startAPIRouteSegmentsFromTSRFilePath(
  src: string,
  config: Config,
): Array<StartAPIRoutePathSegment> {
  const routePath = determineInitialRoutePath(src)

  const parts = routePath
    .replaceAll('.', '/')
    .split('/')
    .filter((p) => !!p && p !== config.indexToken)
  const segments: Array<StartAPIRoutePathSegment> = parts.map((part) => {
    if (part.startsWith('$')) {
      if (part === '$') {
        return { value: part, type: 'splat' }
      }

      part.replaceAll('$', '')
      return { value: part, type: 'param' }
    }

    return { value: part, type: 'path' }
  })

  return segments
}
