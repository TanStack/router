import * as React from 'react'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import { useHydrated } from './ClientOnly'
import type { RouterManagedTag } from '@tanstack/router-core'

interface ScriptAttrs {
  [key: string]: string | boolean | undefined
  src?: string
  suppressHydrationWarning?: boolean
}

export function Asset({
  tag,
  attrs,
  children,
  nonce,
}: RouterManagedTag & { nonce?: string }): React.ReactElement | null {
  switch (tag) {
    case 'title':
      return (
        <title {...attrs} suppressHydrationWarning>
          {children}
        </title>
      )
    case 'meta':
      return <meta {...attrs} suppressHydrationWarning />
    case 'link':
      return <link {...attrs} nonce={nonce} suppressHydrationWarning />
    case 'style':
      return (
        <style
          {...attrs}
          dangerouslySetInnerHTML={{ __html: children as string }}
          nonce={nonce}
        />
      )
    case 'script':
      return <Script attrs={attrs}>{children}</Script>
    default:
      return null
  }
}

function Script({
  attrs,
  children,
}: {
  attrs?: ScriptAttrs
  children?: string
}) {
  const router = useRouter()
  const hydrated = useHydrated()
  const dataScript =
    typeof attrs?.type === 'string' &&
    attrs.type !== '' &&
    attrs.type !== 'text/javascript' &&
    attrs.type !== 'module'

  if (
    process.env.NODE_ENV !== 'production' &&
    attrs?.src &&
    typeof children === 'string' &&
    children.trim().length
  ) {
    console.warn(
      '[TanStack Router] <Script> received both `src` and `children`. The `children` content will be ignored. Remove `children` or remove `src`.',
    )
  }

  React.useEffect(() => {
    if (dataScript) return

    if (attrs?.src) {
      const normSrc = (() => {
        try {
          const base = document.baseURI || window.location.href
          return new URL(attrs.src, base).href
        } catch {
          return attrs.src
        }
      })()
      const existingScript = Array.from(
        document.querySelectorAll('script[src]'),
      ).find((el) => (el as HTMLScriptElement).src === normSrc)

      if (existingScript) {
        return
      }

      const script = document.createElement('script')

      for (const [key, value] of Object.entries(attrs)) {
        if (
          key !== 'suppressHydrationWarning' &&
          value !== undefined &&
          value !== false
        ) {
          script.setAttribute(
            key,
            typeof value === 'boolean' ? '' : String(value),
          )
        }
      }

      document.head.appendChild(script)

      return () => {
        if (script.parentNode) {
          script.parentNode.removeChild(script)
        }
      }
    }

    if (typeof children === 'string') {
      const typeAttr =
        typeof attrs?.type === 'string' ? attrs.type : 'text/javascript'
      const nonceAttr =
        typeof attrs?.nonce === 'string' ? attrs.nonce : undefined
      const existingScript = Array.from(
        document.querySelectorAll('script:not([src])'),
      ).find((el) => {
        if (!(el instanceof HTMLScriptElement)) return false
        const sType = el.getAttribute('type') ?? 'text/javascript'
        const sNonce = el.getAttribute('nonce') ?? undefined
        return (
          el.textContent === children &&
          sType === typeAttr &&
          sNonce === nonceAttr
        )
      })

      if (existingScript) {
        return
      }

      const script = document.createElement('script')
      script.textContent = children

      if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
          if (
            key !== 'suppressHydrationWarning' &&
            value !== undefined &&
            value !== false
          ) {
            script.setAttribute(
              key,
              typeof value === 'boolean' ? '' : String(value),
            )
          }
        }
      }

      document.head.appendChild(script)

      return () => {
        if (script.parentNode) {
          script.parentNode.removeChild(script)
        }
      }
    }

    return undefined
  }, [attrs, children, dataScript])

  // --- Server rendering ---
  if (isServer ?? router.isServer) {
    if (attrs?.src) {
      return <script {...attrs} suppressHydrationWarning />
    }

    if (typeof children === 'string') {
      return (
        <script
          {...attrs}
          dangerouslySetInnerHTML={{ __html: children }}
          suppressHydrationWarning
        />
      )
    }

    return null
  }

  // --- Client rendering ---

  // Data scripts (e.g. application/ld+json) are rendered in the tree;
  // the useEffect intentionally skips them.
  if (dataScript && typeof children === 'string') {
    return (
      <script
        {...attrs}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: children }}
      />
    )
  }

  // During hydration (before useEffect has fired), render the script element
  // to match the server-rendered HTML and avoid structural hydration mismatches.
  // After hydration, return null — the useEffect handles imperative injection.
  if (!hydrated) {
    if (attrs?.src) {
      return <script {...attrs} suppressHydrationWarning />
    }
    if (typeof children === 'string') {
      return (
        <script
          {...attrs}
          dangerouslySetInnerHTML={{ __html: children }}
          suppressHydrationWarning
        />
      )
    }
  }

  return null
}
