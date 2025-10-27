import { createEffect, onCleanup, onMount } from 'solid-js'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'
import type { JSX } from 'solid-js'

export function Asset({
  tag,
  attrs,
  children,
  nonce,
}: RouterManagedTag & { nonce?: string }): JSX.Element | null {
  switch (tag) {
    case 'title':
      return <title {...attrs}>{children}</title>
    case 'meta':
      return <meta {...attrs} />
    case 'link':
      return <link {...attrs} nonce={nonce} />
    case 'style':
      return <style {...attrs} innerHTML={children as string} nonce={nonce} />
    case 'script':
      return <Script attrs={attrs} nonce={nonce}>{children}</Script>
    default:
      return null
  }
}

interface ScriptAttrs {
  [key: string]: string | boolean | undefined
  src?: string
  nonce?: string
}

function Script({
  attrs,
  children,
  nonce,
}: {
  attrs?: ScriptAttrs
  children?: string
  nonce?: string
}): JSX.Element | null {
  const router = useRouter()

  // On client: use onMount to dynamically inject executable scripts
  // The JSX below renders for hydration, but won't execute
  // onMount runs after hydration, so we create a new script that will execute
  if (!router.isServer) {
    onMount(() => {
      if (attrs?.src) {
        const normSrc = (() => {
          try {
            const base = document.baseURI || window.location.href
            return new URL(attrs.src, base).href
          } catch {
            return attrs.src
          }
        })()
        // Exclude SSR scripts from existence check - they won't execute
        const existingScript = Array.from(
          document.querySelectorAll('script[src]:not([data-ssr])'),
        ).find((el) => (el as HTMLScriptElement).src === normSrc)

        if (existingScript) {
          return
        }

        const script = document.createElement('script')

        for (const [key, value] of Object.entries(attrs)) {
          if (value !== undefined && value !== false) {
            script.setAttribute(
              key,
              typeof value === 'boolean' ? '' : String(value),
            )
          }
        }

        document.head.appendChild(script)

        onCleanup(() => {
          if (script.parentNode) {
            script.parentNode.removeChild(script)
          }
        })

        return
      }

      if (typeof children === 'string') {
        const typeAttr =
          typeof attrs?.type === 'string' ? attrs.type : 'text/javascript'
        const nonceAttr = nonce || (typeof attrs?.nonce === 'string' ? attrs.nonce : undefined)
        // Exclude SSR scripts from existence check - they won't execute
        const existingScript = Array.from(
          document.querySelectorAll('script:not([src]):not([data-ssr])'),
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
            if (value !== undefined && value !== false) {
              script.setAttribute(
                key,
                typeof value === 'boolean' ? '' : String(value),
              )
            }
          }
        }

        if (nonceAttr) {
          script.setAttribute('nonce', nonceAttr)
        }

        document.head.appendChild(script)

        onCleanup(() => {
          if (script.parentNode) {
            script.parentNode.removeChild(script)
          }
        })
      }
    })
  }

  // Render script tags for both server and client (hydration)
  // Add data-ssr attribute to mark server-rendered scripts
  if (attrs?.src && typeof attrs.src === 'string') {
    return <script {...attrs} nonce={nonce} data-ssr="true" />
  }

  if (typeof children === 'string') {
    return <script {...attrs} innerHTML={children} nonce={nonce} data-ssr="true" />
  }

  return null
}
