import { appendIdQueryFlag } from '../module-id'
import { CSS_FILE_REGEX, extractCssFromCode, resolveDevUrl } from './dev-styles'
import type { DevEnvironment, EnvironmentModuleNode } from 'vite'

type DevStylesEnvironment = Pick<DevEnvironment, 'transformRequest'> & {
  moduleGraph: Pick<DevEnvironment['moduleGraph'], 'getModuleByUrl'>
}

export async function collectBundledDevStyles(options: {
  serverEnvironment: DevStylesEnvironment
  rootDirectory: string
  entries: Array<string>
  styles: ReadonlyMap<string, string>
}): Promise<string | undefined> {
  const { serverEnvironment, rootDirectory, entries, styles } = options
  const entryNodes = await Promise.all(
    entries.map(async (entry) => {
      const url = resolveDevUrl(rootDirectory, entry)
      const node = await serverEnvironment.moduleGraph.getModuleByUrl(url)
      if (node?.transformResult) {
        return node
      }
      await serverEnvironment.transformRequest(url)
      return serverEnvironment.moduleGraph.getModuleByUrl(url)
    }),
  )
  const stack = entryNodes.reverse()
  const visited = new Set<EnvironmentModuleNode>()
  const urls: Array<string> = []

  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || visited.has(node)) {
      continue
    }
    visited.add(node)
    if (CSS_FILE_REGEX.test(node.url)) {
      const query = new URLSearchParams(node.url.split('?')[1])
      if (
        !['url', 'inline', 'raw', 'inline-css'].some((flag) => query.has(flag))
      ) {
        urls.push(node.url)
      }
      // The compiled parent CSS already contains its @imports.
      continue
    }
    const dependencies = await Promise.all(
      (node.transformResult?.deps ?? []).map((url) =>
        serverEnvironment.moduleGraph.getModuleByUrl(url),
      ),
    )
    dependencies.push(...node.importedModules)
    stack.push(...dependencies.reverse())
  }

  const contents = await Promise.all(
    urls.map((url) => loadBundledDevStyles(serverEnvironment, url, styles)),
  )
  const parts: Array<string> = []
  for (let i = 0; i < urls.length; i++) {
    const css = contents[i]
    if (css) {
      const url = urls[i]!.replace(/\/\*/g, '/\\*').replace(/\*\//g, '*\\/')
      parts.push(`\n/* ${url} */\n${css}`)
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}

export function captureBundledDevStyles(context: {
  getModuleIds: () => Iterable<string>
  getModuleInfo: (id: string) => { code?: string | null } | null
}): ReadonlyMap<string, string> {
  // Workaround (https://github.com/vitejs/vite/issues/22991): replace this
  // generated-code extraction with Vite's SSR stylesheet/output mapping.
  const styles = new Map<string, string>()

  for (const id of context.getModuleIds()) {
    if (!CSS_FILE_REGEX.test(id)) {
      continue
    }
    const code = context.getModuleInfo(id)?.code
    const css = code ? extractCssFromCode(code) : undefined
    if (css !== undefined) {
      styles.set(id.replaceAll('\\', '/'), css)
    }
  }

  return styles
}

export async function loadBundledDevStyles(
  serverEnvironment: DevStylesEnvironment,
  url: string,
  styles: ReadonlyMap<string, string>,
): Promise<string | undefined> {
  const node = await serverEnvironment.moduleGraph.getModuleByUrl(url)
  if (node?.id) {
    const css = styles.get(node.id.replaceAll('\\', '/'))
    if (
      css !== undefined &&
      !css.includes('__VITE_ASSET__') &&
      !css.includes('__VITE_PUBLIC_ASSET__')
    ) {
      return css
    }
  }

  // Workaround (https://github.com/vitejs/vite/issues/22991): SSR-only styles
  // may be absent from the client snapshot, and getModuleInfo can still contain
  // asset placeholders. Replace this fallback with Vite's SSR output mapping.
  // Keep Vue's &lang.css suffix last so Vite still recognizes a CSS request.
  const inlineUrl = url.includes('?')
    ? url.replace('?', '?inline&')
    : appendIdQueryFlag(url, 'inline')
  const result = await serverEnvironment.transformRequest(inlineUrl)
  if (!result) {
    return undefined
  }

  for (const marker of [
    '__vite_ssr_export_default__ = ',
    '__vite_ssr_exports__.default = ',
    'export default ',
  ]) {
    const css = extractCssFromCode(result.code, marker)
    if (css !== undefined) {
      return css
    }
  }

  throw new Error(`Could not extract inline SSR CSS for ${url}`)
}
