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
  nonce,
}: RouterManagedTag & { nonce?: string }): React.ReactElement | null {
  switch (tag) {
    case 'title':
      return <Title attrs={attrs}>{children}</Title>
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

// Track if we've taken control of the title
let titleControlled = false

function Title({
  attrs,
  children,
}: {
  attrs?: Record<string, any>
  children?: string
}) {
  const router = useRouter()

  React.useEffect(() => {
    if (typeof children === 'string') {
      // On the first title update, clean up any existing titles
      if (!titleControlled) {
        // Remove all existing title tags - router will now manage the title
        const existingTitles = Array.from(document.querySelectorAll('title'))
        existingTitles.forEach(titleEl => {
          titleEl.remove()
        })
        titleControlled = true
      }
      
      // Set document.title directly - no DOM title tags needed on client
      document.title = children
    }
  }, [children])

  if (!router.isServer) {
    // On client, don't render title tag - we manage document.title directly
    return null
  }

  // On server, render title tag normally for SSR
  return (
    <title {...attrs} suppressHydrationWarning>
      {children}
    </title>
  )
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
    // render an empty script on the client just to avoid hydration errors
    return (
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: '' }}
      ></script>
    )
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
