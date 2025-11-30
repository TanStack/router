import * as fsp from 'node:fs/promises'
import path from 'node:path'
import * as prettier from 'prettier'
import { rootPathId } from './filesystem/physical/rootPathId'
import type { Config } from './config'
import type { ImportDeclaration, RouteNode } from './types'

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

export function cleanPath(path: string) {
  // remove double slashes
  return path.replace(/\/{2,}/g, '/')
}

export function trimPathLeft(path: string) {
  return path === '/' ? path : path.replace(/^\/{1,}/, '')
}

export function removeLeadingSlash(path: string): string {
  return path.replace(/^\//, '')
}

export function removeTrailingSlash(s: string) {
  return s.replace(/\/$/, '')
}

const BRACKET_CONTENT_RE = /\[(.*?)\]/g
const SPLIT_REGEX = /(?<!\[)\.(?!\])/g

export function determineInitialRoutePath(
  routePath: string,
  config?: Pick<Config, 'experimental' | 'routeToken' | 'indexToken'>,
) {
  const DISALLOWED_ESCAPE_CHARS = new Set([
    '/',
    '\\',
    '?',
    '#',
    ':',
    '*',
    '<',
    '>',
    '|',
    '!',
    '$',
    '%',
  ])

  const originalRoutePath =
    cleanPath(
      `/${(cleanPath(routePath) || '').split(SPLIT_REGEX).join('/')}`,
    ) || ''

  // check if the route path is a valid non-nested path,
  // TODO with new major rename to reflect not experimental anymore
  const isExperimentalNonNestedRoute = isValidNonNestedRoute(
    originalRoutePath,
    config,
  )

  let cleanedRoutePath = routePath

  // we already identified the path as non-nested and can now remove the trailing underscores
  // we need to do this now before we encounter any escaped trailing underscores
  // this way we can be sure any remaining trailing underscores should remain
  // TODO with new major we can remove check and always remove leading underscores
  if (config?.experimental?.nonNestedRoutes) {
    // we should leave trailing underscores if the route path is the root path
    if (originalRoutePath !== `/${rootPathId}`) {
      // remove trailing underscores on various path segments
      cleanedRoutePath = removeTrailingUnderscores(
        originalRoutePath,
        config.routeToken,
      )
    }
  }

  const parts = cleanedRoutePath.split(SPLIT_REGEX)

  // Escape any characters that in square brackets
  // we keep the original path untouched
  const escapedParts = parts.map((part) => {
    // Check if any disallowed characters are used in brackets

    let match
    while ((match = BRACKET_CONTENT_RE.exec(part)) !== null) {
      const character = match[1]
      if (character === undefined) continue
      if (DISALLOWED_ESCAPE_CHARS.has(character)) {
        console.error(
          `Error: Disallowed character "${character}" found in square brackets in route path "${routePath}".\nYou cannot use any of the following characters in square brackets: ${Array.from(
            DISALLOWED_ESCAPE_CHARS,
          ).join(', ')}\nPlease remove and/or replace them.`,
        )
        process.exit(1)
      }
    }

    // Since this split segment is safe at this point, we can
    // remove the brackets and replace them with the content inside
    return part.replace(BRACKET_CONTENT_RE, '$1')
  })

  // If the syntax for prefix/suffix is different, from the path
  // matching internals of router-core, we'd perform those changes here
  // on the `escapedParts` array before it is joined back together in
  // `final`

  const final = cleanPath(`/${escapedParts.join('/')}`) || ''

  return {
    routePath: final,
    isExperimentalNonNestedRoute,
    originalRoutePath,
  }
}

export function replaceBackslash(s: string) {
  return s.replaceAll(/\\/gi, '/')
}

export function routePathToVariable(routePath: string): string {
  const toVariableSafeChar = (char: string): string => {
    if (/[a-zA-Z0-9_]/.test(char)) {
      return char // Keep alphanumeric characters and underscores as is
    }

    // Replace special characters with meaningful text equivalents
    switch (char) {
      case '.':
        return 'Dot'
      case '-':
        return 'Dash'
      case '@':
        return 'At'
      case '(':
        return '' // Removed since route groups use parentheses
      case ')':
        return '' // Removed since route groups use parentheses
      case ' ':
        return '' // Remove spaces
      default:
        return `Char${char.charCodeAt(0)}` // For any other characters
    }
  }

  return (
    removeUnderscores(routePath)
      ?.replace(/\/\$\//g, '/splat/')
      .replace(/\$$/g, 'splat')
      .replace(/\$\{\$\}/g, 'splat')
      .replace(/\$/g, '')
      .split(/[/-]/g)
      .map((d, i) => (i > 0 ? capitalize(d) : d))
      .join('')
      .split('')
      .map(toVariableSafeChar)
      .join('')
      // .replace(/([^a-zA-Z0-9]|[.])/gm, '')
      .replace(/^(\d)/g, 'R$1') ?? ''
  )
}

export function removeUnderscores(s?: string) {
  return s?.replaceAll(/(^_|_$)/gi, '').replaceAll(/(\/_|_\/)/gi, '/')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function removeLeadingUnderscores(s: string, routeToken: string) {
  if (!s) return s

  const hasLeadingUnderscore = routeToken[0] === '_'

  const routeTokenToExclude = hasLeadingUnderscore
    ? routeToken.slice(1)
    : routeToken

  const escapedRouteToken = escapeRegExp(routeTokenToExclude)

  const leadingUnderscoreRegex = hasLeadingUnderscore
    ? new RegExp(`(?<=^|\\/)_(?!${escapedRouteToken})`, 'g')
    : new RegExp(`(?<=^|\\/)_`, 'g')

  return s.replaceAll(leadingUnderscoreRegex, '')
}

export function removeTrailingUnderscores(s: string, routeToken: string) {
  if (!s) return s

  const hasTrailingUnderscore = routeToken.slice(-1) === '_'

  const routeTokenToExclude = hasTrailingUnderscore
    ? routeToken.slice(0, -1)
    : routeToken

  const escapedRouteToken = escapeRegExp(routeTokenToExclude)

  const trailingUnderscoreRegex = hasTrailingUnderscore
    ? new RegExp(`(?<!${escapedRouteToken})_(?=\\/|$)`, 'g')
    : new RegExp(`_(?=\\/)|_$`, 'g')

  return s.replaceAll(trailingUnderscoreRegex, '')
}

export function capitalize(s: string) {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function removeExt(d: string, keepExtension: boolean = false) {
  return keepExtension ? d : d.substring(0, d.lastIndexOf('.')) || d
}

/**
 * This function writes to a file if the content is different.
 *
 * @param filepath The path to the file
 * @param content Original content
 * @param incomingContent New content
 * @param callbacks Callbacks to run before and after writing
 * @returns Whether the file was written
 */
export async function writeIfDifferent(
  filepath: string,
  content: string,
  incomingContent: string,
  callbacks?: { beforeWrite?: () => void; afterWrite?: () => void },
): Promise<boolean> {
  if (content !== incomingContent) {
    callbacks?.beforeWrite?.()
    await fsp.writeFile(filepath, incomingContent)
    callbacks?.afterWrite?.()
    return true
  }
  return false
}

/**
 * This function formats the source code using the default formatter (Prettier).
 *
 * @param source The content to format
 * @param config The configuration object
 * @returns The formatted content
 */
export async function format(
  source: string,
  config: {
    quoteStyle: 'single' | 'double'
    semicolons: boolean
  },
): Promise<string> {
  const prettierOptions: prettier.Config = {
    semi: config.semicolons,
    singleQuote: config.quoteStyle === 'single',
    parser: 'typescript',
  }
  return prettier.format(source, prettierOptions)
}

/**
 * This function resets the regex index to 0 so that it can be reused
 * without having to create a new regex object or worry about the last
 * state when using the global flag.
 *
 * @param regex The regex object to reset
 * @returns
 */
export function resetRegex(regex: RegExp) {
  regex.lastIndex = 0
  return
}

/**
 * This function checks if a file exists.
 *
 * @param file The path to the file
 * @returns Whether the file exists
 */
export async function checkFileExists(file: string) {
  try {
    await fsp.access(file, fsp.constants.F_OK)
    return true
  } catch {
    return false
  }
}

const possiblyNestedRouteGroupPatternRegex = /\([^/]+\)\/?/g
export function removeGroups(s: string) {
  return s.replace(possiblyNestedRouteGroupPatternRegex, '')
}

/**
 * Removes all segments from a given path that start with an underscore ('_').
 *
 * @param {string} routePath - The path from which to remove segments. Defaults to '/'.
 * @returns {string} The path with all underscore-prefixed segments removed.
 * @example
 * removeLayoutSegments('/workspace/_auth/foo') // '/workspace/foo'
 */
export function removeLayoutSegments(routePath: string = '/'): string {
  const segments = routePath.split('/')
  const newSegments = segments.filter((segment) => !segment.startsWith('_'))
  return newSegments.join('/')
}

/**
 * The `node.path` is used as the `id` in the route definition.
 * This function checks if the given node has a parent and if so, it determines the correct path for the given node.
 * @param node - The node to determine the path for.
 * @returns The correct path for the given node.
 */
export function determineNodePath(node: RouteNode) {
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

export function hasParentRoute(
  routes: Array<RouteNode>,
  node: RouteNode,
  routePathToCheck: string | undefined,
  originalRoutePathToCheck: string | undefined,
): RouteNode | null {
  const getNonNestedSegments = (routePath: string) => {
    const regex = /_(?=\/|$)/g

    return [...routePath.matchAll(regex)]
      .filter((match) => {
        const beforeStr = routePath.substring(0, match.index)
        const openBrackets = (beforeStr.match(/\[/g) || []).length
        const closeBrackets = (beforeStr.match(/\]/g) || []).length
        return openBrackets === closeBrackets
      })
      .map((match) => routePath.substring(0, match.index + 1))
      .reverse()
  }

  if (!routePathToCheck || routePathToCheck === '/') {
    return null
  }

  const sortedNodes = multiSortBy(routes, [
    (d) => d.routePath!.length * -1,
    (d) => d.variableName,
  ]).filter((d) => d.routePath !== `/${rootPathId}`)

  const filteredNodes = node._isExperimentalNonNestedRoute
    ? []
    : [...sortedNodes]

  if (node._isExperimentalNonNestedRoute && originalRoutePathToCheck) {
    const nonNestedSegments = getNonNestedSegments(originalRoutePathToCheck)

    for (const route of sortedNodes) {
      if (route.routePath === '/') continue

      if (
        route._isExperimentalNonNestedRoute &&
        route.routePath !== routePathToCheck &&
        originalRoutePathToCheck.startsWith(`${route.originalRoutePath}/`)
      ) {
        return route
      }

      if (
        nonNestedSegments.find(
          (seg) => seg === `${route.originalRoutePath}_`,
        ) ||
        !(
          route._fsRouteType === 'pathless_layout' ||
          route._fsRouteType === 'layout' ||
          route._fsRouteType === '__root'
        )
      ) {
        continue
      }

      filteredNodes.push(route)
    }
  }

  for (const route of filteredNodes) {
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

  return hasParentRoute(routes, node, parentRoutePath, originalRoutePathToCheck)
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
 * Checks if a given RouteNode is valid for augmenting it with typing based on conditions.
 * Also asserts that the RouteNode is defined.
 *
 * @param routeNode - The RouteNode to check.
 * @returns A boolean indicating whether the RouteNode is defined.
 */
export function isRouteNodeValidForAugmentation(
  routeNode?: RouteNode,
): routeNode is RouteNode {
  if (!routeNode || routeNode.isVirtual) {
    return false
  }
  return true
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
 * Infers the full path for use by TS
 */
export const inferFullPath = (
  routeNode: RouteNode,
  config?: Pick<Config, 'experimental' | 'routeToken'>,
): string => {
  // with new nonNestedPaths feature we can be sure any remaining trailing underscores are escaped and should remain
  // TODO with new major we can remove check and only remove leading underscores
  const fullPath = removeGroups(
    (config?.experimental?.nonNestedRoutes
      ? removeLayoutSegments(routeNode.routePath)
      : removeUnderscores(removeLayoutSegments(routeNode.routePath))) ?? '',
  )

  return routeNode.cleanedPath === '/' ? fullPath : fullPath.replace(/\/$/, '')
}

/**
 * Creates a map from fullPath to routeNode
 */
export const createRouteNodesByFullPath = (
  routeNodes: Array<RouteNode>,
  config?: Pick<Config, 'experimental' | 'routeToken'>,
): Map<string, RouteNode> => {
  return new Map(
    routeNodes.map((routeNode) => [
      inferFullPath(routeNode, config),
      routeNode,
    ]),
  )
}

/**
 * Create a map from 'to' to a routeNode
 */
export const createRouteNodesByTo = (
  routeNodes: Array<RouteNode>,
  config?: Pick<Config, 'experimental' | 'routeToken'>,
): Map<string, RouteNode> => {
  return new Map(
    dedupeBranchesAndIndexRoutes(routeNodes).map((routeNode) => [
      inferTo(routeNode, config),
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
 * Infers to path
 */
export const inferTo = (
  routeNode: RouteNode,
  config?: Pick<Config, 'experimental' | 'routeToken'>,
): string => {
  const fullPath = inferFullPath(routeNode, config)

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

export function checkRouteFullPathUniqueness(
  _routes: Array<RouteNode>,
  config: Config,
) {
  const routes = _routes.map((d) => {
    const inferredFullPath = inferFullPath(d, config)
    return { ...d, inferredFullPath }
  })

  const conflictingFiles = checkUnique(routes, 'inferredFullPath')

  if (conflictingFiles !== undefined) {
    const errorMessage = `Conflicting configuration paths were found for the following route${conflictingFiles.length > 1 ? 's' : ''}: ${conflictingFiles
      .map((p) => `"${p.inferredFullPath}"`)
      .join(', ')}.
Please ensure each Route has a unique full path.
Conflicting files: \n ${conflictingFiles.map((d) => path.resolve(config.routesDirectory, d.filePath)).join('\n ')}\n`
    throw new Error(errorMessage)
  }
}

export function buildRouteTreeConfig(
  nodes: Array<RouteNode>,
  disableTypes: boolean,
  depth = 1,
): Array<string> {
  const children = nodes.map((node) => {
    if (node._fsRouteType === '__root') {
      return
    }

    if (node._fsRouteType === 'pathless_layout' && !node.children?.length) {
      return
    }

    const route = `${node.variableName}`

    if (node.children?.length) {
      const childConfigs = buildRouteTreeConfig(
        node.children,
        disableTypes,
        depth + 1,
      )

      const childrenDeclaration = disableTypes
        ? ''
        : `interface ${route}RouteChildren {
  ${node.children
    .map(
      (child) =>
        `${child.variableName}Route: typeof ${getResolvedRouteNodeVariableName(child)}`,
    )
    .join(',')}
}`

      const children = `const ${route}RouteChildren${disableTypes ? '' : `: ${route}RouteChildren`} = {
  ${node.children
    .map(
      (child) =>
        `${child.variableName}Route: ${getResolvedRouteNodeVariableName(child)}`,
    )
    .join(',')}
}`

      const routeWithChildren = `const ${route}RouteWithChildren = ${route}Route._addFileChildren(${route}RouteChildren)`

      return [
        childConfigs.join('\n'),
        childrenDeclaration,
        children,
        routeWithChildren,
      ].join('\n\n')
    }

    return undefined
  })

  return children.filter((x) => x !== undefined)
}

export function buildImportString(
  importDeclaration: ImportDeclaration,
): string {
  const { source, specifiers, importKind } = importDeclaration
  return specifiers.length
    ? `import ${importKind === 'type' ? 'type ' : ''}{ ${specifiers.map((s) => (s.local ? `${s.imported} as ${s.local}` : s.imported)).join(', ')} } from '${source}'`
    : ''
}

export function lowerCaseFirstChar(value: string) {
  if (!value[0]) {
    return value
  }

  return value[0].toLowerCase() + value.slice(1)
}

export function mergeImportDeclarations(
  imports: Array<ImportDeclaration>,
): Array<ImportDeclaration> {
  const merged: Record<string, ImportDeclaration> = {}

  for (const imp of imports) {
    const key = `${imp.source}-${imp.importKind}`
    if (!merged[key]) {
      merged[key] = { ...imp, specifiers: [] }
    }
    for (const specifier of imp.specifiers) {
      // check if the specifier already exists in the merged import
      if (
        !merged[key].specifiers.some(
          (existing) =>
            existing.imported === specifier.imported &&
            existing.local === specifier.local,
        )
      ) {
        merged[key].specifiers.push(specifier)
      }
    }
  }

  return Object.values(merged)
}

export const findParent = (node: RouteNode | undefined): string => {
  if (!node) {
    return `rootRouteImport`
  }
  if (node.parent) {
    if (node.isVirtualParentRequired) {
      return `${node.parent.variableName}Route`
    } else {
      return `${node.parent.variableName}Route`
    }
  }
  return findParent(node.parent)
}

export function buildFileRoutesByPathInterface(opts: {
  routeNodes: Array<RouteNode>
  module: string
  interfaceName: string
  config?: Pick<Config, 'experimental' | 'routeToken'>
}): string {
  return `declare module '${opts.module}' {
  interface ${opts.interfaceName} {
    ${opts.routeNodes
      .map((routeNode) => {
        const filePathId = routeNode.routePath
        const preloaderRoute = `typeof ${routeNode.variableName}RouteImport`

        const parent = findParent(routeNode)

        return `'${filePathId}': {
          id: '${filePathId}'
          path: '${inferPath(routeNode)}'
          fullPath: '${inferFullPath(routeNode, opts.config)}'
          preLoaderRoute: ${preloaderRoute}
          parentRoute: typeof ${parent}
        }`
      })
      .join('\n')}
  }
}`
}

export function getImportPath(
  node: RouteNode,
  config: Config,
  generatedRouteTreePath: string,
): string {
  return replaceBackslash(
    removeExt(
      path.relative(
        path.dirname(generatedRouteTreePath),
        path.resolve(config.routesDirectory, node.filePath),
      ),
      config.addExtensions,
    ),
  )
}

export function getImportForRouteNode(
  node: RouteNode,
  config: Config,
  generatedRouteTreePath: string,
  root: string,
): ImportDeclaration {
  let source = ''
  if (config.importRoutesUsingAbsolutePaths) {
    source = replaceBackslash(
      removeExt(
        path.resolve(root, config.routesDirectory, node.filePath),
        config.addExtensions,
      ),
    )
  } else {
    source = `./${getImportPath(node, config, generatedRouteTreePath)}`
  }
  return {
    source,
    specifiers: [
      {
        imported: 'Route',
        local: `${node.variableName}RouteImport`,
      },
    ],
  } satisfies ImportDeclaration
}

/**
 * Used to validate if a route is a pathless layout route
 * @param normalizedRoutePath Normalized route path, i.e `/foo/_layout/route.tsx` and `/foo._layout.route.tsx` to `/foo/_layout/route`
 * @param config The `router-generator` configuration object
 * @returns Boolean indicating if the route is a pathless layout route
 */
export function isValidNonNestedRoute(
  normalizedRoutePath: string,
  config?: Pick<Config, 'experimental' | 'routeToken' | 'indexToken'>,
): boolean {
  if (!config?.experimental?.nonNestedRoutes) {
    return false
  }

  const segments = normalizedRoutePath.split('/').filter(Boolean)

  if (segments.length === 0) {
    return false
  }

  const lastRouteSegment = segments[segments.length - 1]!

  // If segment === __root, then exit as false
  if (lastRouteSegment === rootPathId) {
    return false
  }

  if (
    lastRouteSegment !== config.indexToken &&
    lastRouteSegment !== config.routeToken &&
    lastRouteSegment.endsWith('_')
  ) {
    return true
  }

  for (const segment of segments.slice(0, -1).reverse()) {
    if (segment === config.routeToken) {
      return false
    }

    if (segment.endsWith('_')) {
      return true
    }
  }

  return false
}
