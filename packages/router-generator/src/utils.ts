/* eslint-disable @typescript-eslint/prefer-for-of */
import * as fsp from 'node:fs/promises'
import path from 'node:path'
import * as prettier from 'prettier'
import { rootPathId } from './filesystem/physical/rootPathId'
import type { Config } from './config'
import type { ImportDeclaration, RouteNode } from './types'

/**
 * Prefix map for O(1) parent route lookups.
 * Maps each route path prefix to the route node that owns that prefix.
 * Enables finding longest matching parent without linear search.
 */
export class RoutePrefixMap {
  private prefixToRoute: Map<string, RouteNode> = new Map()
  private layoutRoutes: Array<RouteNode> = []
  private nonNestedRoutes: Array<RouteNode> = []

  constructor(routes: Array<RouteNode>) {
    for (const route of routes) {
      if (!route.routePath || route.routePath === `/${rootPathId}`) continue

      // Index by exact path for direct lookups
      this.prefixToRoute.set(route.routePath, route)

      // Track layout routes separately for non-nested route handling
      if (
        route._fsRouteType === 'pathless_layout' ||
        route._fsRouteType === 'layout' ||
        route._fsRouteType === '__root'
      ) {
        this.layoutRoutes.push(route)
      }

      // Track non-nested routes separately
      if (route._isExperimentalNonNestedRoute) {
        this.nonNestedRoutes.push(route)
      }
    }

    // Sort by path length descending for longest-match-first
    this.layoutRoutes.sort(
      (a, b) => (b.routePath?.length ?? 0) - (a.routePath?.length ?? 0),
    )
    this.nonNestedRoutes.sort(
      (a, b) => (b.routePath?.length ?? 0) - (a.routePath?.length ?? 0),
    )
  }

  /**
   * Find the longest matching parent route for a given path.
   * O(k) where k is the number of path segments, not O(n) routes.
   */
  findParent(routePath: string): RouteNode | null {
    if (!routePath || routePath === '/') return null

    // Walk up the path segments
    let searchPath = routePath
    while (searchPath.length > 0) {
      const lastSlash = searchPath.lastIndexOf('/')
      if (lastSlash <= 0) break

      searchPath = searchPath.substring(0, lastSlash)
      const parent = this.prefixToRoute.get(searchPath)
      if (parent && parent.routePath !== routePath) {
        return parent
      }
    }
    return null
  }

  /**
   * Find parent for non-nested routes (needs layout route matching).
   */
  findParentForNonNested(
    routePath: string,
    originalRoutePath: string | undefined,
    nonNestedSegments: Array<string>,
  ): RouteNode | null {
    // First check for other non-nested routes that are prefixes
    // Use pre-sorted array for longest-match-first
    for (const route of this.nonNestedRoutes) {
      if (
        route.routePath !== routePath &&
        originalRoutePath?.startsWith(`${route.originalRoutePath}/`)
      ) {
        return route
      }
    }

    // Then check layout routes
    for (const route of this.layoutRoutes) {
      if (route.routePath === '/') continue

      // Skip if this route's original path + underscore matches a non-nested segment
      if (
        nonNestedSegments.some((seg) => seg === `${route.originalRoutePath}_`)
      ) {
        continue
      }

      // Check if this layout route is a prefix of the path we're looking for
      if (
        routePath.startsWith(`${route.routePath}/`) &&
        route.routePath !== routePath
      ) {
        return route
      }
    }

    return null
  }

  /**
   * Check if a route exists at the given path.
   */
  has(routePath: string): boolean {
    return this.prefixToRoute.has(routePath)
  }

  /**
   * Get a route by exact path.
   */
  get(routePath: string): RouteNode | undefined {
    return this.prefixToRoute.get(routePath)
  }
}

export function multiSortBy<T>(
  arr: Array<T>,
  accessors: Array<(item: T) => any> = [(d) => d],
): Array<T> {
  const len = arr.length
  // Pre-compute all accessor values to avoid repeated function calls during sort
  const indexed: Array<{ item: T; index: number; keys: Array<any> }> =
    new Array(len)
  for (let i = 0; i < len; i++) {
    const item = arr[i]!
    const keys = new Array(accessors.length)
    for (let j = 0; j < accessors.length; j++) {
      keys[j] = accessors[j]!(item)
    }
    indexed[i] = { item, index: i, keys }
  }

  indexed.sort((a, b) => {
    for (let j = 0; j < accessors.length; j++) {
      const ao = a.keys[j]
      const bo = b.keys[j]

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

    return a.index - b.index
  })

  const result: Array<T> = new Array(len)
  for (let i = 0; i < len; i++) {
    result[i] = indexed[i]!.item
  }
  return result
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

const backslashRegex = /\\/g

export function replaceBackslash(s: string) {
  return s.replace(backslashRegex, '/')
}

const alphanumericRegex = /[a-zA-Z0-9_]/
const splatSlashRegex = /\/\$\//g
const trailingSplatRegex = /\$$/g
const bracketSplatRegex = /\$\{\$\}/g
const dollarSignRegex = /\$/g
const splitPathRegex = /[/-]/g
const leadingDigitRegex = /^(\d)/g

const toVariableSafeChar = (char: string): string => {
  if (alphanumericRegex.test(char)) {
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

export function routePathToVariable(routePath: string): string {
  const cleaned = removeUnderscores(routePath)
  if (!cleaned) return ''

  const parts = cleaned
    .replace(splatSlashRegex, '/splat/')
    .replace(trailingSplatRegex, 'splat')
    .replace(bracketSplatRegex, 'splat')
    .replace(dollarSignRegex, '')
    .split(splitPathRegex)

  let result = ''
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    const segment = i > 0 ? capitalize(part) : part
    for (let j = 0; j < segment.length; j++) {
      result += toVariableSafeChar(segment[j]!)
    }
  }

  return result.replace(leadingDigitRegex, 'R$1')
}

const underscoreStartEndRegex = /(^_|_$)/gi
const underscoreSlashRegex = /(\/_|_\/)/gi

export function removeUnderscores(s?: string) {
  return s
    ?.replace(underscoreStartEndRegex, '')
    .replace(underscoreSlashRegex, '/')
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

const nonNestedSegmentRegex = /_(?=\/|$)/g
const openBracketRegex = /\[/g
const closeBracketRegex = /\]/g

/**
 * Extracts non-nested segments from a route path.
 * Used for determining parent routes in non-nested route scenarios.
 */
export function getNonNestedSegments(routePath: string): Array<string> {
  nonNestedSegmentRegex.lastIndex = 0
  const result: Array<string> = []
  for (const match of routePath.matchAll(nonNestedSegmentRegex)) {
    const beforeStr = routePath.substring(0, match.index)
    openBracketRegex.lastIndex = 0
    closeBracketRegex.lastIndex = 0
    const openBrackets = beforeStr.match(openBracketRegex)?.length ?? 0
    const closeBrackets = beforeStr.match(closeBracketRegex)?.length ?? 0
    if (openBrackets === closeBrackets) {
      result.push(routePath.substring(0, match.index + 1))
    }
  }
  return result.reverse()
}

/**
 * Find parent route using RoutePrefixMap for O(k) lookups instead of O(n).
 */
export function hasParentRoute(
  prefixMap: RoutePrefixMap,
  node: RouteNode,
  routePathToCheck: string | undefined,
  originalRoutePathToCheck: string | undefined,
): RouteNode | null {
  if (!routePathToCheck || routePathToCheck === '/') {
    return null
  }

  if (node._isExperimentalNonNestedRoute && originalRoutePathToCheck) {
    const nonNestedSegments = getNonNestedSegments(originalRoutePathToCheck)
    return prefixMap.findParentForNonNested(
      routePathToCheck,
      originalRoutePathToCheck,
      nonNestedSegments,
    )
  }

  return prefixMap.findParent(routePathToCheck)
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
  const merged = new Map<string, ImportDeclaration>()

  for (const imp of imports) {
    const key = `${imp.source}-${imp.importKind ?? ''}`
    let existing = merged.get(key)
    if (!existing) {
      existing = { ...imp, specifiers: [] }
      merged.set(key, existing)
    }

    const existingSpecs = existing.specifiers
    for (const specifier of imp.specifiers) {
      let found = false
      for (let i = 0; i < existingSpecs.length; i++) {
        const e = existingSpecs[i]!
        if (e.imported === specifier.imported && e.local === specifier.local) {
          found = true
          break
        }
      }
      if (!found) {
        existingSpecs.push(specifier)
      }
    }
  }

  return [...merged.values()]
}

export const findParent = (node: RouteNode | undefined): string => {
  if (!node) {
    return `rootRouteImport`
  }
  if (node.parent) {
    return `${node.parent.variableName}Route`
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
