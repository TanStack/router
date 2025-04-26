import path, { isAbsolute, join, normalize } from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import {
  format,
  logging,
  multiSortBy,
  physicalGetRouteNodes,
  removeExt,
  removeUnderscores,
  replaceBackslash,
  resetRegex,
  rootPathId,
  routePathToVariable,
  trimPathLeft,
  virtualGetRouteNodes,
  writeIfDifferent,
} from '@tanstack/router-generator'
import { fillTemplate, getTargetTemplate } from './template'
import type { GetRouteNodesResult, RouteNode } from '@tanstack/router-generator'
import type { Config } from './config'
import type { Plugin } from 'vite'

let lock = false
const checkLock = () => lock
const setLock = (bool: boolean) => {
  lock = bool
}

export function TanStackStartServerRoutesVite(config: Config): Plugin {
  let ROOT: string = process.cwd()

  const getRoutesDirectoryPath = () => {
    return isAbsolute(config.routesDirectory)
      ? config.routesDirectory
      : join(ROOT, config.routesDirectory)
  }

  const generate = async () => {
    if (checkLock()) {
      return
    }

    setLock(true)

    try {
      await generator(config, ROOT)
    } catch (err) {
      console.error(err)
      console.info()
    } finally {
      setLock(false)
    }
  }

  const handleFile = async (file: string) => {
    const filePath = normalize(file)

    const routesDirectoryPath = getRoutesDirectoryPath()
    if (filePath.startsWith(routesDirectoryPath)) {
      await generate()
    }
  }

  return {
    name: 'tanstack-start-server-routes-plugin',
    configureServer(server) {
      server.watcher.on('all', (event, path) => {
        handleFile(path)
      })
    },
    configResolved(config) {
      ROOT = config.root
    },
    async buildStart() {
      await generate()
      // if (this.environment.name === 'server') {
      // }
    },
    sharedDuringBuild: true,
    resolveId(id) {
      if (id === 'tanstack:server-routes') {
        const generatedRouteTreePath = getGeneratedRouteTreePath(ROOT)
        return generatedRouteTreePath
      }
      return null
    },
  }
}

// Maybe import this from `@tanstack/router-core` in the future???
const rootRouteId = '__root__'

let latestTask = 0
const routeGroupPatternRegex = /\(.+\)/g
const possiblyNestedRouteGroupPatternRegex = /\([^/]+\)\/?/g

let isFirst = false
let skipMessage = false

function getGeneratedRouteTreePath(root: string) {
  return path.resolve(
    root,
    '.tanstack-start/server-routes/routeTree.gen.ts',
  )
}

async function generator(config: Config, root: string) {
  const generatedRouteTreePath = getGeneratedRouteTreePath(root)
  const ROUTE_TEMPLATE = getTargetTemplate(config.target)
  const logger = logging({ disabled: config.disableLogging })

  if (!isFirst) {
    // logger.log('♻️  Generating server routes...')
    isFirst = true
  } else if (skipMessage) {
    skipMessage = false
  } else {
    // logger.log('♻️  Regenerating server routes...')
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
      errorMessage += `\nMake sure that you add a "${rootPathId}.tsx" file to your routes directory.\nAdd the file in: "${config.routesDirectory}/${rootPathId}.tsx"`
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
            // logger.log(`🟡 Creating ${node.fullPath}`)
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

    const routeCode = fs.readFileSync(node.fullPath, 'utf-8')

    // Ensure the boilerplate for the route exists, which can be skipped for virtual parent routes and virtual routes
    if (!node.isVirtualParentRoute && !node.isVirtual) {
      // const escapedRoutePath = node.routePath?.replaceAll('$', '$$') ?? ''
      // let replaced = routeCode
      // await writeIfDifferent(node.fullPath, routeCode, replaced, {
      //   beforeWrite: () => {
      //     // logger.log(`🟡 Updating ${node.fullPath}`)
      //   },
      // })
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

    if (
      !routeCode
        .split('\n')
        .some((line) => line.trim().startsWith('export const ServerRoute'))
    ) {
      return
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

  // This is run against the `routeNodes` array since it
  // has the accumulated (intended) Server Route nodes
  // Since TSR allows multiple way of defining a route,
  // we need to ensure that a user hasn't defined the
  // same route in multiple ways (i.e. `flat`, `nested`, `virtual`)
  checkRouteFullPathUniqueness(routeNodes, config)

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

        const childrenDeclaration = `interface ${route}Children {
  ${node.children.map((child) => `${child.variableName}Route: typeof ${getResolvedRouteNodeVariableName(child)}`).join(',')}
}`

        const children = `const ${route}Children: ${route}Children = {
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
  })
    .filter((d) => d[1])
    .map((d) => d[0])

  const virtualRouteNodes = sortedRouteNodes.filter((d) => d.isVirtual)

  function getImportPath(node: RouteNode) {
    return replaceBackslash(
      removeExt(
        path.relative(
          path.dirname(generatedRouteTreePath),
          path.resolve(config.routesDirectory, node.filePath),
        ),
      ),
    )
  }

  const rootRouteExists = fs.existsSync(rootRouteNode.fullPath)
  const rootRouteCode = rootRouteExists
    ? fs.readFileSync(rootRouteNode.fullPath, 'utf-8')
    : ''
  const hasServerRootRoute =
    rootRouteExists && rootRouteCode.includes('export const ServerRoute')

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
      `import type { FileRoutesByPath, CreateServerFileRoute } from '${ROUTE_TEMPLATE.fullPkg}'`,
      `import { createServerRoute, createServerFileRoute } from '${ROUTE_TEMPLATE.fullPkg}'`,
      //       `
      // if (typeof globalThis !== 'undefined') {
      //   ;(globalThis as any).createServerFileRoute = createServerFileRoute
      // } else if (typeof window !== 'undefined') {
      //   ;(window as any).createServerFileRoute = createServerFileRoute
      // }`,
      hasServerRootRoute
        ? `import { ServerRoute as rootRouteImport } from './${getImportPath(rootRouteNode)}'`
        : '',
      ...sortedRouteNodes
        .filter((d) => !d.isVirtual)
        .map((node) => {
          return `import { ServerRoute as ${
            node.variableName
          }RouteImport } from './${getImportPath(node)}'`
        }),
    ].join('\n'),
    virtualRouteNodes.length ? '// Create Virtual Routes' : '',
    virtualRouteNodes
      .map((node) => {
        return `const ${
          node.variableName
        }RouteImport = createFileRoute('${node.routePath}')()`
      })
      .join('\n'),
    '// Create/Update Routes',
    !hasServerRootRoute
      ? `
      const rootRoute = createServerRoute()
    `
      : '',
    sortedRouteNodes
      .map((node) => {
        return [
          [
            `const ${node.variableName}Route = ${node.variableName}RouteImport.update({
          ${[
            `id: '${node.path}'`,
            !node.isNonPath ? `path: '${node.cleanedPath}'` : undefined,
            `getParentRoute: () => ${node.parent?.variableName ?? 'root'}Route`,
          ]
            .filter(Boolean)
            .join(',')}
        } as any)`,
          ].join(''),
        ].join('\n\n')
      })
      .join('\n\n'),
    '',

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
          preLoaderRoute: typeof ${routeNode.variableName}RouteImport
          parentRoute: typeof ${
            routeNode.isVirtualParentRequired
              ? `${routeNode.parent?.variableName}Route`
              : routeNode.parent?.variableName
                ? `${routeNode.parent.variableName}RouteImport`
                : 'rootRoute'
          }
        }`
      })
      .join('\n')}
  }
}`,
    `// Add type-safety to the createFileRoute function across the route tree`,
    routeNodes
      .map((routeNode) => {
        return `declare module './${getImportPath(routeNode)}' {
const createServerFileRoute: CreateServerFileRoute<
FileRoutesByPath['${routeNode.routePath}']['parentRoute'],
FileRoutesByPath['${routeNode.routePath}']['id'],
FileRoutesByPath['${routeNode.routePath}']['path'],
FileRoutesByPath['${routeNode.routePath}']['fullPath'],
${routeNode.children?.length ? `${routeNode.variableName}RouteChildren` : 'unknown'}
>
}`
      })
      .join('\n'),
    '// Create and export the route tree',
    routeConfigChildrenText,
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
  '${rootRouteId}': typeof rootRoute,
  ${[...createRouteNodesById(routeNodes).entries()].map(([id, routeNode]) => {
    return `'${id}': typeof ${getResolvedRouteNodeVariableName(routeNode)}`
  })}
}`,
    `export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: ${routeNodes.length > 0 ? [...createRouteNodesByFullPath(routeNodes).keys()].map((fullPath) => `'${fullPath}'`).join('|') : 'never'}
  fileRoutesByTo: FileRoutesByTo
  to: ${routeNodes.length > 0 ? [...createRouteNodesByTo(routeNodes).keys()].map((to) => `'${to}'`).join('|') : 'never'}
  id: ${[`'${rootRouteId}'`, ...[...createRouteNodesById(routeNodes).keys()].map((id) => `'${id}'`)].join('|')}
  fileRoutesById: FileRoutesById
}`,
    `export interface RootRouteChildren {
  ${routeTree.map((child) => `${child.variableName}Route: typeof ${getResolvedRouteNodeVariableName(child)}`).join(',')}
}`,
    `const rootRouteChildren: RootRouteChildren = {
  ${routeTree.map((child) => `${child.variableName}Route: ${getResolvedRouteNodeVariableName(child)}`).join(',')}
}`,
    `export const routeTree = rootRoute._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>()`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const createRouteManifest = () => {
    const routesManifest = {
      [rootRouteId]: {
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
  const routeConfigFileContent = !includeManifest.includes(config.target)
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
    .readFile(path.resolve(generatedRouteTreePath), 'utf-8')
    .catch((err) => {
      if (err.code === 'ENOENT') {
        return ''
      }

      throw err
    })

  if (!checkLatest()) return

  // Ensure the directory exists
  await fsp.mkdir(path.dirname(path.resolve(generatedRouteTreePath)), {
    recursive: true,
  })

  if (!checkLatest()) return

  // Write the route tree file, if it has changed
  const routeTreeWriteResult = await writeIfDifferent(
    path.resolve(generatedRouteTreePath),
    await format(existingRouteTreeContent, config),
    await format(routeConfigFileContent, config),
    {
      beforeWrite: () => {
        // logger.log(`🟡 Updating ${generatedRouteTreePath}`)
      },
    },
  )
  if (routeTreeWriteResult && !checkLatest()) {
    return
  }

  // logger.log(
  //   `✅ Processed ${routeNodes.length === 1 ? 'server route' : 'server routes'} in ${
  //     Date.now() - start
  //   }ms`,
  // )
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
function removeLastSegmentFromPath(routePath: string = '/'): string {
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

function hasParentRoute(
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
const getResolvedRouteNodeVariableName = (routeNode: RouteNode): string => {
  return routeNode.children?.length
    ? `${routeNode.variableName}RouteWithChildren`
    : `${routeNode.variableName}Route`
}

/**
 * Creates a map from fullPath to routeNode
 */
const createRouteNodesByFullPath = (
  routeNodes: Array<RouteNode>,
): Map<string, RouteNode> => {
  return new Map(
    routeNodes.map((routeNode) => [inferFullPath(routeNode), routeNode]),
  )
}

/**
 * Create a map from 'to' to a routeNode
 */
const createRouteNodesByTo = (
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
const createRouteNodesById = (
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
const inferFullPath = (routeNode: RouteNode): string => {
  const fullPath = removeGroups(
    removeUnderscores(removeLayoutSegments(routeNode.routePath)) ?? '',
  )

  return routeNode.cleanedPath === '/' ? fullPath : fullPath.replace(/\/$/, '')
}

/**
 * Infers the path for use by TS
 */
const inferPath = (routeNode: RouteNode): string => {
  return routeNode.cleanedPath === '/'
    ? routeNode.cleanedPath
    : (routeNode.cleanedPath?.replace(/\/$/, '') ?? '')
}

/**
 * Infers to path
 */
const inferTo = (routeNode: RouteNode): string => {
  const fullPath = inferFullPath(routeNode)

  if (fullPath === '/') return fullPath

  return fullPath.replace(/\/$/, '')
}

/**
 * Dedupes branches and index routes
 */
const dedupeBranchesAndIndexRoutes = (
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
Please ensure each Server Route has a unique full path.
Conflicting files: \n ${conflictingFiles.map((d) => path.resolve(config.routesDirectory, d.filePath)).join('\n ')}\n`
    console.error(errorMessage)
    process.exit(1)
  }
}
