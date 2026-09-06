import { appendIdQueryFlag } from '../module-id'
import { CSS_FILE_REGEX, extractCssFromCode } from './dev-styles'
import type { DevStylesEnvironment } from './dev-styles'

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
