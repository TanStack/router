/**
 * CSS collection for dev mode.
 * Crawls the Vite module graph to collect CSS from the router entry and all its dependencies.
 */
import type { ModuleNode, ViteDevServer } from 'vite'

// CSS file extensions supported by Vite
const CSS_FILE_REGEX =
  /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/
// URL params that indicate CSS should not be injected (e.g., ?url, ?inline)
const CSS_SIDE_EFFECT_FREE_PARAMS = ['url', 'inline', 'raw', 'inline-css']

function isCssFile(file: string): boolean {
  return CSS_FILE_REGEX.test(file)
}

function hasCssSideEffectFreeParam(url: string): boolean {
  const queryString = url.split('?')[1]
  if (!queryString) return false

  const params = new URLSearchParams(queryString)
  return CSS_SIDE_EFFECT_FREE_PARAMS.some(
    (param) =>
      params.get(param) === '' &&
      !url.includes(`?${param}=`) &&
      !url.includes(`&${param}=`),
  )
}

export interface CollectDevStylesOptions {
  viteDevServer: ViteDevServer
  entries: Array<string>
}

/**
 * Collect CSS content from the module graph starting from the given entry points.
 */
export async function collectDevStyles(
  opts: CollectDevStylesOptions,
): Promise<string | undefined> {
  const { viteDevServer, entries } = opts
  const styles: Map<string, string> = new Map()
  const visited = new Set<ModuleNode>()

  for (const entry of entries) {
    const normalizedPath = entry.replace(/\\/g, '/')
    let node = viteDevServer.moduleGraph.getModuleById(normalizedPath)

    // If module isn't in the graph yet, request it to trigger transform
    if (!node) {
      try {
        await viteDevServer.transformRequest(normalizedPath)
      } catch (err) {
        // Ignore - the module might not exist yet
      }
      node = viteDevServer.moduleGraph.getModuleById(normalizedPath)
    }

    if (node) {
      await crawlModuleForCss(viteDevServer, node, visited, styles)
    }
  }

  if (styles.size === 0) return undefined

  return Array.from(styles.entries())
    .map(([fileName, css]) => {
      const escapedFileName = fileName
        .replace(/\/\*/g, '/\\*')
        .replace(/\*\//g, '*\\/')
      return `\n/* ${escapedFileName} */\n${css}`
    })
    .join('\n')
}

async function crawlModuleForCss(
  vite: ViteDevServer,
  node: ModuleNode,
  visited: Set<ModuleNode>,
  styles: Map<string, string>,
): Promise<void> {
  if (visited.has(node)) return
  visited.add(node)

  const branches: Array<Promise<void>> = []

  // Ensure the module has been transformed to populate its deps
  // This is important for code-split modules that may not have been processed yet
  if (!node.ssrTransformResult) {
    try {
      await vite.transformRequest(node.url, { ssr: true })
      // Re-fetch the node to get updated state
      const updatedNode = await vite.moduleGraph.getModuleByUrl(node.url)
      if (updatedNode) {
        node = updatedNode
      }
    } catch {
      // Ignore transform errors - the module might not be transformable
    }
  }

  // Check if this is a CSS file
  if (
    node.file &&
    isCssFile(node.file) &&
    !hasCssSideEffectFreeParam(node.url)
  ) {
    const css = await loadCssContent(vite, node)
    if (css) {
      styles.set(node.url, css)
    }
  }

  // Crawl dependencies using ssrTransformResult.deps and importedModules
  // We need both because:
  // 1. ssrTransformResult.deps has resolved URLs for SSR dependencies
  // 2. importedModules may contain CSS files and code-split modules not in SSR deps
  const depsFromSsr = node.ssrTransformResult?.deps ?? []
  const urlsToVisit = new Set<string>(depsFromSsr)

  // Check importedModules for CSS files and additional modules
  for (const importedNode of node.importedModules) {
    if (importedNode.file && isCssFile(importedNode.file)) {
      // CSS files often don't appear in ssrTransformResult.deps, add them explicitly
      branches.push(crawlModuleForCss(vite, importedNode, visited, styles))
    } else if (!urlsToVisit.has(importedNode.url)) {
      // Also add non-CSS imports that aren't in SSR deps (e.g., code-split modules)
      urlsToVisit.add(importedNode.url)
    }
  }

  for (const depUrl of urlsToVisit) {
    branches.push(
      (async () => {
        const depNode = await vite.moduleGraph.getModuleByUrl(depUrl)
        if (depNode) {
          await crawlModuleForCss(vite, depNode, visited, styles)
        }
      })(),
    )
  }

  await Promise.all(branches)
}

async function loadCssContent(
  vite: ViteDevServer,
  node: ModuleNode,
): Promise<string | undefined> {
  // For ALL CSS files (including CSS modules), get the transformed content
  // and extract __vite__css. Vite's transform puts the final CSS (with hashed
  // class names for modules) into the __vite__css variable.
  const transformResult = await vite.transformRequest(node.url)
  if (!transformResult?.code) return undefined

  // Extract CSS content from Vite's transformed module
  return extractCssFromViteModule(transformResult.code)
}

/**
 * Extract CSS string from Vite's transformed CSS module code.
 * Vite wraps CSS content in a JS module with __vite__css variable.
 */
function extractCssFromViteModule(code: string): string | undefined {
  // Match: const __vite__css = "..."
  const match = code.match(/const\s+__vite__css\s*=\s*["'`]([\s\S]*?)["'`]/)
  if (match?.[1]) {
    // Unescape the string
    return match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
  return undefined
}
