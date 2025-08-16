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

export function determineInitialRoutePath(routePath: string) {
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

  const parts = routePath.split(/(?<!\[)\.(?!\])/g)

  // Escape any characters that in square brackets
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

  return final
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
  variableNameSuffix: string,
): string => {
  return routeNode.children?.length
    ? `${routeNode.variableName}${variableNameSuffix}WithChildren`
    : `${routeNode.variableName}${variableNameSuffix}`
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
export const inferFullPath = (routeNode: RouteNode): string => {
  const fullPath = removeGroups(
    removeUnderscores(removeLayoutSegments(routeNode.routePath)) ?? '',
  )

  return routeNode.cleanedPath === '/' ? fullPath : fullPath.replace(/\/$/, '')
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

export function checkRouteFullPathUniqueness(
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
Please ensure each Route has a unique full path.
Conflicting files: \n ${conflictingFiles.map((d) => path.resolve(config.routesDirectory, d.filePath)).join('\n ')}\n`
    throw new Error(errorMessage)
  }
}

export function buildRouteTreeConfig(
  nodes: Array<RouteNode>,
  exportName: string,
  disableTypes: boolean,
  depth = 1,
): Array<string> {
  const children = nodes
    .filter((n) => n.exports?.includes(exportName))
    .map((node) => {
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
          exportName,
          disableTypes,
          depth + 1,
        )

        const childrenDeclaration = disableTypes
          ? ''
          : `interface ${route}${exportName}Children {
  ${node.children
    .filter((n) => n.exports?.includes(exportName))
    .map(
      (child) =>
        `${child.variableName}${exportName}: typeof ${getResolvedRouteNodeVariableName(child, exportName)}`,
    )
    .join(',')}
}`

        const children = `const ${route}${exportName}Children${disableTypes ? '' : `: ${route}${exportName}Children`} = {
  ${node.children
    .filter((n) => n.exports?.includes(exportName))
    .map(
      (child) =>
        `${child.variableName}${exportName}: ${getResolvedRouteNodeVariableName(child, exportName)}`,
    )
    .join(',')}
}`

        const routeWithChildren = `const ${route}${exportName}WithChildren = ${route}${exportName}._addFileChildren(${route}${exportName}Children)`

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

export function hasChildWithExport(
  node: RouteNode,
  exportName: string,
): boolean {
  return (
    node.children?.some((child) => hasChildWithExport(child, exportName)) ??
    false
  )
}

export const findParent = (
  node: RouteNode | undefined,
  exportName: string,
): string => {
  if (!node) {
    return `root${exportName}Import`
  }
  if (node.parent) {
    if (node.parent.exports?.includes(exportName)) {
      if (node.isVirtualParentRequired) {
        return `${node.parent.variableName}${exportName}`
      } else {
        return `${node.parent.variableName}${exportName}`
      }
    }
  }
  return findParent(node.parent, exportName)
}

export function buildFileRoutesByPathInterface(opts: {
  routeNodes: Array<RouteNode>
  module: string
  interfaceName: string
  exportName: string
}): string {
  return `declare module '${opts.module}' {
  interface ${opts.interfaceName} {
    ${opts.routeNodes
      .map((routeNode) => {
        const filePathId = routeNode.routePath
        let preloaderRoute = ''

        if (routeNode.exports?.includes(opts.exportName)) {
          preloaderRoute = `typeof ${routeNode.variableName}${opts.exportName}Import`
        } else {
          preloaderRoute = 'unknown'
        }

        const parent = findParent(routeNode, opts.exportName)

        return `'${filePathId}': {
          id: '${filePathId}'
          path: '${inferPath(routeNode)}'
          fullPath: '${inferFullPath(routeNode)}'
          preLoaderRoute: ${preloaderRoute}
          parentRoute: typeof ${parent}
        }`
      })
      .join('\n')}
  }
}`
}
