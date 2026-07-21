import type { AnyRouter } from '@tanstack/router-core'

export type NativeScriptLinkingMode = 'push' | 'replace'

export interface NativeScriptLinkingOptions {
  prefixes?: Array<string>
  getInitialURL?: () => Promise<string | null> | string | null
  subscribe?: (listener: (url: string) => void) => () => void
  parseURL?: (url: string) => string | null
  initialMode?: NativeScriptLinkingMode
  incomingMode?: NativeScriptLinkingMode
  onUnhandledURL?: (url: string) => void
  onError?: (error: unknown, url?: string) => void
}

function ensureLeadingSlash(value: string): string {
  if (!value) {
    return '/'
  }
  return value.startsWith('/') ? value : `/${value}`
}

function normalizeURLAuthorityCase(value: string): string {
  const match = value.match(/^([A-Za-z][A-Za-z\d+.-]*:\/\/)([^/?#]*)/)
  if (!match) {
    return value
  }

  const scheme = match[1]!.toLowerCase()
  const authority = match[2]!
  const userInfoEnd = authority.lastIndexOf('@') + 1
  const userInfo = authority.slice(0, userInfoEnd)
  const host = authority.slice(userInfoEnd).toLowerCase()
  return `${scheme}${userInfo}${host}${value.slice(match[0].length)}`
}

/** Convert an app/universal link into a router href. */
export function parseNativeScriptURL(
  url: string,
  prefixes: Array<string> = [],
): string | null {
  if (!url) {
    return null
  }
  if (url.startsWith('/')) {
    return url
  }

  const normalizedURL = normalizeURLAuthorityCase(url)
  const normalizedPrefixes = prefixes
    .map((prefix) => normalizeURLAuthorityCase(prefix).replace(/\/$/, ''))
    .sort((left, right) => right.length - left.length)
  const prefix = normalizedPrefixes.find(
    (candidate) =>
      normalizedURL === candidate ||
      normalizedURL.startsWith(`${candidate}/`) ||
      normalizedURL.startsWith(`${candidate}?`) ||
      normalizedURL.startsWith(`${candidate}#`),
  )
  if (prefix) {
    return ensureLeadingSlash(normalizedURL.slice(prefix.length))
  }
  if (prefixes.length) {
    return null
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return ensureLeadingSlash(
        `${parsed.pathname}${parsed.search}${parsed.hash}`,
      )
    }

    return ensureLeadingSlash(
      `${parsed.host ? `/${parsed.host}` : ''}${parsed.pathname}${parsed.search}${parsed.hash}`,
    )
  } catch {
    return null
  }
}

export async function navigateNativeScriptURL(
  router: AnyRouter,
  options: NativeScriptLinkingOptions,
  url: string,
  mode: NativeScriptLinkingMode,
): Promise<void> {
  try {
    const href = options.parseURL
      ? options.parseURL(url)
      : parseNativeScriptURL(url, options.prefixes)
    if (!href) {
      options.onUnhandledURL?.(url)
      return
    }
    if (router.history.location.href === href) {
      return
    }

    await router.navigate({
      to: undefined,
      href,
      stackBehavior: mode,
    })
  } catch (error) {
    options.onError?.(error, url)
  }
}

export function setupNativeScriptLinking(
  router: AnyRouter,
  options: NativeScriptLinkingOptions,
): () => void {
  let active = true
  let receivedIncomingURL = false
  let unsubscribe: (() => void) | undefined

  try {
    unsubscribe = options.subscribe?.((url) => {
      if (!active) {
        return
      }
      receivedIncomingURL = true
      void navigateNativeScriptURL(
        router,
        options,
        url,
        options.incomingMode ?? 'push',
      )
    })
  } catch (error) {
    options.onError?.(error)
  }

  const initialize = async () => {
    try {
      const initialURL = await options.getInitialURL?.()
      if (active && initialURL && !receivedIncomingURL) {
        await navigateNativeScriptURL(
          router,
          options,
          initialURL,
          options.initialMode ?? 'replace',
        )
      }
    } catch (error) {
      options.onError?.(error)
    }
  }

  void initialize()
  return () => {
    active = false
    unsubscribe?.()
  }
}
