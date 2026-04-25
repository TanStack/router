import { transform } from 'lightningcss'

const cssUrlPattern =
  /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)|@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)|"([^"]*)"|'([^']*)')/gi

function isRelativeCssUrl(url: string) {
  if (!url) return false
  if (url.startsWith('#')) return false
  if (url.startsWith('/')) return false
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return false
  return true
}

export function shouldRebaseInlineCssUrls(css: string) {
  cssUrlPattern.lastIndex = 0

  for (const match of css.matchAll(cssUrlPattern)) {
    const url = (
      match[1] ??
      match[2] ??
      match[3] ??
      match[4] ??
      match[5] ??
      match[6] ??
      match[7] ??
      match[8] ??
      ''
    ).trim()

    if (isRelativeCssUrl(url)) {
      return true
    }
  }

  return false
}

function rebaseCssUrl(url: string, cssHref: string) {
  if (!isRelativeCssUrl(url)) {
    return url
  }

  const fakeOrigin = 'http://tanstack.local'
  const resolved = new URL(url, new URL(cssHref, fakeOrigin))

  if (resolved.origin === fakeOrigin) {
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  }

  return resolved.href
}

export function rebaseInlineCssUrls(options: { css: string; cssHref: string }) {
  const css = options.css.trim()

  if (!shouldRebaseInlineCssUrls(css)) {
    return css
  }

  const result = transform({
    filename: options.cssHref,
    code: Buffer.from(css),
    minify: true,
    visitor: {
      Url(url) {
        return {
          ...url,
          url: rebaseCssUrl(url.url, options.cssHref),
        }
      },
      Rule: {
        import(rule: any) {
          return {
            ...rule,
            value: {
              ...rule.value,
              url: rebaseCssUrl(rule.value.url, options.cssHref),
            },
          }
        },
      },
    },
  })

  return Buffer.from(result.code).toString('utf8')
}

export function getCssAssetSource(source: unknown) {
  if (typeof source === 'string') return source
  if (source instanceof Uint8Array) return Buffer.from(source).toString('utf8')
  if (source == null) return undefined
  return String(source)
}
