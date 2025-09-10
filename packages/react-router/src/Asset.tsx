import * as React from 'react'
import { useRouter } from './useRouter'
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
}: RouterManagedTag): React.ReactElement | null {
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
      return <link {...attrs} suppressHydrationWarning />
    case 'style':
      return (
        <style
          {...attrs}
          dangerouslySetInnerHTML={{ __html: children as string }}
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

  React.useEffect(() => {
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
  }, [attrs, children])

  if (!router.isServer) {
    return null
  }

  if (attrs?.src && typeof attrs.src === 'string') {
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
