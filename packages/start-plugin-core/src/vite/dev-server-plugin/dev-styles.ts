/**
 * CSS collection for dev mode.
 * Discovers styles through the SSR module graph and loads their compiled CSS separately.
 */
import path from 'node:path'
import type { DevEnvironment, EnvironmentModuleNode } from 'vite'

// CSS file extensions supported by Vite
export const CSS_FILE_REGEX =
  /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/
// URL params that indicate CSS should not be injected (e.g., ?url, ?inline)
const CSS_SIDE_EFFECT_FREE_PARAMS = ['url', 'inline', 'raw', 'inline-css']

// Marker to find the CSS string in Vite's transformed output
const VITE_CSS_MARKER = 'const __vite__css = '

const ESCAPE_CSS_COMMENT_START_REGEX = /\/\*/g
const ESCAPE_CSS_COMMENT_END_REGEX = /\*\//g

function isCssFile(file: string): boolean {
  return CSS_FILE_REGEX.test(file)
}

function hasCssSideEffectFreeParam(url: string): boolean {
  const queryString = url.split('?')[1]
  if (!queryString) return false

  const params = new URLSearchParams(queryString)
  return CSS_SIDE_EFFECT_FREE_PARAMS.some((param) => params.has(param))
}

/**
 * Resolve a file path to a Vite dev server URL.
 * Files within the root directory use relative paths, files outside use /@fs prefix.
 */
function resolveDevUrl(rootDirectory: string, filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const relativePath = path.posix.relative(
    rootDirectory.replace(/\\/g, '/'),
    normalizedPath,
  )
  const isWithinRoot =
    !relativePath.startsWith('..') && !path.isAbsolute(relativePath)

  if (isWithinRoot) {
    return path.posix.join('/', relativePath)
  }
  // Files outside root need /@fs prefix
  return path.posix.join('/@fs', normalizedPath)
}

export type DevStylesEnvironment = Pick<DevEnvironment, 'transformRequest'> & {
  moduleGraph: Pick<DevEnvironment['moduleGraph'], 'getModuleByUrl'>
}

export interface CollectDevStylesOptions {
  serverEnvironment: DevStylesEnvironment
  rootDirectory: string
  entries: Array<string>
  loadCssContents: (url: string) => Promise<string | undefined>
}

/**
 * Collect CSS content from the module graph starting from the given entry points.
 */
export async function collectDevStyles(
  opts: CollectDevStylesOptions,
): Promise<string | undefined> {
  const { serverEnvironment, rootDirectory, entries, loadCssContents } = opts
  const styles: Map<string, string> = new Map()
  const visited = new Set<EnvironmentModuleNode>()

  // Process entries in parallel - each entry is independent
  await Promise.all(
    entries.map((entry) =>
      processEntry(
        serverEnvironment,
        resolveDevUrl(rootDirectory, entry),
        visited,
      ),
    ),
  )

  // Collect CSS from visited modules in parallel
  const cssPromises: Array<Promise<readonly [string, string] | null>> = []

  for (const dep of visited) {
    if (hasCssSideEffectFreeParam(dep.url)) {
      continue
    }

    if (!isCssFile(dep.url)) {
      continue
    }

    // Load compiled CSS in parallel, preserving the discovered node order.
    cssPromises.push(
      loadCssContents(dep.url).then((css) =>
        css ? ([dep.url, css] as const) : null,
      ),
    )
  }

  // Wait for all CSS loads to complete
  const cssResults = await Promise.all(cssPromises)
  for (const result of cssResults) {
    if (result) {
      styles.set(result[0], result[1])
    }
  }

  if (styles.size === 0) return undefined

  const parts: Array<string> = []
  for (const [fileName, css] of styles.entries()) {
    const escapedFileName = fileName
      .replace(ESCAPE_CSS_COMMENT_START_REGEX, '/\\*')
      .replace(ESCAPE_CSS_COMMENT_END_REGEX, '*\\/')
    parts.push(`\n/* ${escapedFileName} */\n${css}`)
  }
  return parts.join('\n')
}

/**
 * Process an entry URL: transform it if needed, get the module node, and crawl its dependencies.
 */
async function processEntry(
  environment: DevStylesEnvironment,
  entryUrl: string,
  visited: Set<EnvironmentModuleNode>,
): Promise<void> {
  let node = await environment.moduleGraph.getModuleByUrl(entryUrl)

  // Only transform if needed so transformResult.deps is available for crawling.
  if (!node?.transformResult) {
    try {
      await environment.transformRequest(entryUrl)
    } catch {
      // ignore - module might not exist yet
    }
    node = await environment.moduleGraph.getModuleByUrl(entryUrl)
  }

  if (!node || visited.has(node)) return

  visited.add(node)
  await findModuleDeps(environment, node, visited)
}

/**
 * Find all module dependencies by crawling the module graph.
 * Uses transformResult.deps for URL-based lookups (parallel) and
 * importedModules for already-resolved nodes (parallel).
 */
async function findModuleDeps(
  environment: DevStylesEnvironment,
  node: EnvironmentModuleNode,
  visited: Set<EnvironmentModuleNode>,
): Promise<void> {
  // Note: caller must add node to visited BEFORE calling this function
  // to prevent race conditions with parallel traversal

  // CSS @imports are already included in the compiled parent stylesheet.
  if (isCssFile(node.url)) {
    return
  }

  // Process deps from transformResult if available (URLs including bare imports)
  const deps = node.transformResult?.deps ?? null

  const importedModules = node.importedModules

  // Fast path: no deps and no imports
  if ((!deps || deps.length === 0) && importedModules.size === 0) {
    return
  }

  // Build branches only when needed (avoid array allocation on leaf nodes)
  const branches: Array<Promise<void>> = []

  if (deps) {
    for (const depUrl of deps) {
      const dep = await environment.moduleGraph.getModuleByUrl(depUrl)
      if (!dep) continue

      if (visited.has(dep)) continue
      visited.add(dep)
      branches.push(findModuleDeps(environment, dep, visited))
    }
  }

  // ALWAYS also traverse importedModules - this catches:
  // - Code-split chunks (e.g. ?tsr-split=component) not in deps
  // - Already-resolved nodes
  for (const depNode of importedModules) {
    if (visited.has(depNode)) continue
    visited.add(depNode)
    branches.push(findModuleDeps(environment, depNode, visited))
  }

  if (branches.length === 1) {
    await branches[0]
    return
  }

  await Promise.all(branches)
}

export async function fetchCssFromModule(
  environment: DevStylesEnvironment,
  url: string,
): Promise<string | undefined> {
  const node = await environment.moduleGraph.getModuleByUrl(url)
  const cachedCode = node?.transformResult?.code
  if (cachedCode) {
    return extractCssFromCode(cachedCode)
  }

  // Otherwise request a fresh transform
  try {
    const transformResult = await environment.transformRequest(url)
    if (!transformResult?.code) return undefined

    return extractCssFromCode(transformResult.code)
  } catch {
    // Preprocessor partials (e.g., Sass files with mixins) can't compile in isolation.
    // The root stylesheet that @imports them will contain the compiled CSS.
    return undefined
  }
}

/**
 * Extract CSS content from Vite's transformed CSS module code.
 *
 * Vite embeds CSS into the module as a JS string via `JSON.stringify(cssContent)`,
 * e.g. `const __vite__css = ${JSON.stringify('...css...')}`.
 *
 * We locate that JSON string literal and run `JSON.parse` on it to reverse the
 * escaping (\\n, \\t, \\", \\\\, \\uXXXX, etc.).
 */
export function extractCssFromCode(
  code: string,
  marker = VITE_CSS_MARKER,
): string | undefined {
  const startIdx = code.indexOf(marker)
  if (startIdx === -1) return undefined

  const valueStart = startIdx + marker.length
  // Vite emits `const __vite__css = ${JSON.stringify(cssContent)}` which always
  // produces double-quoted JSON string literals.
  if (code.charCodeAt(valueStart) !== 34) return undefined

  const codeLength = code.length
  let i = valueStart + 1
  while (i < codeLength) {
    const charCode = code.charCodeAt(i)
    // 34 = '"'
    if (charCode === 34) {
      try {
        return JSON.parse(code.slice(valueStart, i + 1))
      } catch {
        return undefined
      }
    }
    // 92 = '\\'
    if (charCode === 92) {
      i += 2
    } else {
      i++
    }
  }

  return undefined
}
