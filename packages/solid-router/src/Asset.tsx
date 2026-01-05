import { onCleanup, onMount } from 'solid-js'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'
import type { JSX } from 'solid-js'

export function Asset({
  tag,
  attrs,
  children,
}: RouterManagedTag): JSX.Element | null {
  const router = useRouter()

  if (router.isServer) {
    switch (tag) {
      case 'title':
        return <title {...attrs}>{children}</title>
      case 'meta':
        return <meta {...attrs} />
      case 'link':
        return <link {...attrs} />
      case 'style':
        if (typeof children === 'string') {
          return <style {...attrs} innerHTML={children} />
        }
        return <style {...attrs} />
      case 'script':
        if (attrs?.src && typeof attrs.src === 'string') {
          return <script {...attrs} />
        }
        if (typeof children === 'string') {
          return <script {...attrs} innerHTML={children} />
        }
        return <script {...attrs} />
      default:
        return null
    }
  }

  switch (tag) {
    case 'title':
      return <HeadTag tag="title" attrs={attrs} children={children} />
    case 'meta':
      return <HeadTag tag="meta" attrs={attrs} />
    case 'link':
      return <HeadTag tag="link" attrs={attrs} />
    case 'style':
      return <HeadTag tag="style" attrs={attrs} children={children} />
    case 'script':
      return <Script attrs={attrs}>{children}</Script>
    default:
      return null
  }
}

interface ScriptAttrs {
  [key: string]: string | boolean | undefined
  src?: string
}

function Script({
  attrs,
  children,
}: {
  attrs?: ScriptAttrs
  children?: string
}): JSX.Element | null {
  const router = useRouter()

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
      const existingScript = Array.from(
        document.querySelectorAll('script[src]'),
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
          if (value !== undefined && value !== false) {
            script.setAttribute(
              key,
              typeof value === 'boolean' ? '' : String(value),
            )
          }
        }
      }

      document.head.appendChild(script)

      onCleanup(() => {
        if (script.parentNode) {
          script.parentNode.removeChild(script)
        }
      })
    }
  })

  if (!router.isServer) {
    // render an empty script on the client just to avoid hydration errors
    return null
  }

  if (attrs?.src && typeof attrs.src === 'string') {
    return <script {...attrs} />
  }

  if (typeof children === 'string') {
    return <script {...attrs} innerHTML={children} />
  }

  return null
}

function HeadTag({
  tag,
  attrs,
  children,
}: {
  tag: 'title' | 'meta' | 'link' | 'style'
  attrs?: Record<string, any>
  children?: string
}): null {
  onMount(() => {
    if (typeof document === 'undefined') {
      return
    }

    const element = findOrCreateHeadElement(tag, attrs, children)

    if (!element) {
      return
    }

    onCleanup(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element)
      }
    })
  })

  return null
}

function findOrCreateHeadElement(
  tag: 'title' | 'meta' | 'link' | 'style',
  attrs?: Record<string, any>,
  children?: string,
) {
  const existing = findExistingHeadElement(tag, attrs, children)
  if (existing) {
    return existing
  }

  const element = document.createElement(tag)
  setAttributes(element, attrs)

  if (typeof children === 'string' && (tag === 'title' || tag === 'style')) {
    element.textContent = children
  }

  document.head.appendChild(element)

  return element
}

function findExistingHeadElement(
  tag: 'title' | 'meta' | 'link' | 'style',
  attrs?: Record<string, any>,
  children?: string,
) {
  const candidates = document.head.querySelectorAll(tag)
  for (const candidate of candidates) {
    if (!matchesAttributes(candidate, attrs)) {
      continue
    }

    if (typeof children === 'string' && (tag === 'title' || tag === 'style')) {
      if (candidate.textContent !== children) {
        continue
      }
    }

    return candidate as HTMLElement
  }

  return undefined
}

function matchesAttributes(
  element: Element,
  attrs?: Record<string, any>,
): boolean {
  if (!attrs) {
    return true
  }

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) {
      continue
    }

    if (value === true) {
      if (!element.hasAttribute(key)) {
        return false
      }
      continue
    }

    if (element.getAttribute(key) !== String(value)) {
      return false
    }
  }

  return true
}

function setAttributes(element: Element, attrs?: Record<string, any>) {
  if (!attrs) {
    return
  }

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) {
      continue
    }

    element.setAttribute(key, value === true ? '' : String(value))
  }
}
