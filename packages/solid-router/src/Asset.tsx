import { isServer } from '@tanstack/router-core/isServer'
import { createEffect } from 'solid-js'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'
import type { JSX } from '@solidjs/web'

export function Asset({
  tag,
  attrs,
  children,
}: RouterManagedTag): JSX.Element | null {
  switch (tag) {
    case 'title':
      return <Title attrs={attrs} children={children} />
    case 'meta':
      return <HeadElement tag="meta" attrs={attrs} />
    case 'link':
      return <HeadElement tag="link" attrs={attrs} />
    case 'style':
      return <HeadElement tag="style" attrs={attrs} children={children} />
    case 'script':
      return <Script attrs={attrs} children={children} />
    default:
      return null
  }
}

function HeadElement(props: {
  tag: 'meta' | 'link' | 'style'
  attrs?: Record<string, any>
  children?: unknown
}): JSX.Element | null {
  const router = useRouter()

  // Server: render the element in the tree so it's part of the SSR'd HTML.
  // (Where <HeadContent /> is placed determines where it appears in the SSR
  // output; the head-content design supports rendering in <body> for full-
  // document hydration.)
  if (isServer ?? router.isServer) {
    const { tag, attrs, children } = props
    if (tag === 'style' && typeof children === 'string') {
      return <style {...attrs} innerHTML={children} />
    }
    if (tag === 'style') return <style {...attrs} />
    if (tag === 'meta') return <meta {...attrs} />
    return <link {...attrs} />
  }

  // Client: imperatively insert the element into document.head so it lands
  // in <head> even when <HeadContent /> is placed in <body>, and reactively
  // update on attribute/children changes via createEffect cleanup.
  createEffect(
    () => ({ tag: props.tag, attrs: props.attrs, children: props.children }),
    ({ tag, attrs, children }) => {
      const el = document.createElement(tag)

      if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
          if (value !== undefined && value !== false && value !== null) {
            el.setAttribute(
              key,
              typeof value === 'boolean' ? '' : String(value),
            )
          }
        }
      }

      if (tag === 'style' && typeof children === 'string') {
        el.textContent = children
      }

      document.head.appendChild(el)

      return () => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      }
    },
  )

  return null
}

function Title(props: {
  attrs?: Record<string, any>
  children?: unknown
}): JSX.Element | null {
  const router = useRouter()
  const attrs = props.attrs
  const children = props.children

  // Server: render <title> normally
  if (isServer ?? router.isServer) {
    return <title {...attrs}>{children as string}</title>
  }

  // Client: imperatively set document.title so it updates during
  // client-side navigation (JSX <title> in <head> doesn't reliably
  // update the browser's document.title).
  createEffect(
    () => children,
    (titleText) => {
      document.title = typeof titleText === 'string' ? titleText : ''
    },
  )

  // Still render the <title> element in the DOM for consistency,
  // but the imperative assignment above is what actually drives the update.
  return <title {...attrs}>{children as string}</title>
}

function Script(props: {
  attrs?: Record<string, any>
  children?: unknown
}): JSX.Element | null {
  const router = useRouter()
  const attrs = props.attrs
  const children = props.children

  const dataScript =
    typeof attrs?.type === 'string' &&
    attrs.type !== '' &&
    attrs.type !== 'text/javascript' &&
    attrs.type !== 'module'

  // --- Server rendering ---
  if (isServer ?? router.isServer) {
    if (attrs?.src) {
      return <script {...attrs} />
    }

    if (typeof children === 'string') {
      return <script {...attrs} innerHTML={children} />
    }

    return null
  }

  // --- Client rendering ---

  // Data scripts (e.g. application/ld+json) are rendered in the tree;
  // they don't need to execute.
  if (dataScript && typeof children === 'string') {
    return <script {...attrs} innerHTML={children} />
  }

  // For executable scripts, use imperative DOM injection so the browser
  // actually executes them during client-side navigation.
  createEffect(
    () => ({ attrs, children, dataScript }) as const,
    ({ attrs, children, dataScript }) => {
      if (dataScript) return

      let script: HTMLScriptElement | undefined

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

        script = document.createElement('script')

        for (const [key, value] of Object.entries(attrs)) {
          if (value !== undefined && value !== false) {
            script.setAttribute(
              key,
              typeof value === 'boolean' ? '' : String(value),
            )
          }
        }

        document.head.appendChild(script)
      } else if (typeof children === 'string') {
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

        script = document.createElement('script')
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

        document.head.appendChild(script)
      }

      return () => {
        if (script?.parentNode) {
          script.parentNode.removeChild(script)
        }
      }
    },
  )

  return null
}
