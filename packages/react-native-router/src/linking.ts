export type NativeLinkingMode = 'replace' | 'push'

export interface NativeLinkingOptions {
  /**
   * Enable/disable built-in deep link handling.
   * @default true
   */
  enabled?: boolean
  /**
   * URL prefixes that should be handled by this app.
   * Examples: ['myapp://', 'https://myapp.com']
   */
  prefixes?: Array<string>
  /**
   * Optional URL filter. Return false to ignore a URL.
   */
  filter?: (url: string) => boolean
  /**
   * Custom URL parser to map an external URL to an internal router href.
   * Return null to ignore the URL.
   */
  parseUrl?: (url: string) => string | null
  /**
   * Initial URL handler used on mount (cold start).
   */
  getInitialURL?: () => Promise<string | null>
  /**
   * URL subscription for runtime links while app is already open.
   */
  subscribe?: (listener: (url: string) => void) => () => void
  /**
   * Navigation behavior for the initial URL.
   * @default 'push'
   */
  initialMode?: NativeLinkingMode
  /**
   * Whether initial deep-link push should animate.
   *
   * When `false`, initial deep-link pushes are marked to skip transition
   * animation so startup does not look like an in-app navigation.
   * @default false
   */
  initialAnimate?: boolean
  /**
   * Navigation behavior for incoming URLs while the app is running.
   * @default 'push'
   */
  incomingMode?: NativeLinkingMode
  /**
   * Called when a URL is received but cannot be handled.
   */
  onUnhandledUrl?: (url: string) => void
  /**
   * Called when URL parsing/navigation throws.
   */
  onError?: (error: unknown, url?: string) => void
}

function trimTrailingSlash(input: string) {
  return input.length > 1 && input.endsWith('/') ? input.slice(0, -1) : input
}

function ensureLeadingSlash(href: string) {
  if (!href) return '/'
  if (href.startsWith('/')) return href
  return `/${href}`
}

function parseWithPrefixes(
  url: string,
  prefixes: Array<string>,
): string | null {
  if (!prefixes.length) return null

  const normalizedPrefixes = prefixes
    .map((prefix) => trimTrailingSlash(prefix))
    .sort((a, b) => b.length - a.length)

  const matchedPrefix = normalizedPrefixes.find((prefix) => {
    if (url.startsWith(prefix)) return true
    return url.startsWith(`${prefix}/`)
  })

  if (!matchedPrefix) {
    return null
  }

  const remainder = url.slice(matchedPrefix.length)
  return ensureLeadingSlash(remainder)
}

export function parseExternalUrl(
  url: string,
  prefixes: Array<string>,
): string | null {
  if (!url) return null

  if (url.startsWith('/')) return url

  const prefixed = parseWithPrefixes(url, prefixes)
  if (prefixed) {
    return prefixed
  }

  if (prefixes.length > 0) {
    return null
  }

  try {
    const parsed = new URL(url)

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      const href = `${parsed.pathname}${parsed.search}${parsed.hash}`
      return ensureLeadingSlash(href)
    }

    const nativePath = parsed.host
      ? `/${parsed.host}${parsed.pathname}`
      : parsed.pathname

    return ensureLeadingSlash(`${nativePath}${parsed.search}${parsed.hash}`)
  } catch {
    return null
  }
}
