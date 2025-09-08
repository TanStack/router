import { Meta, Style, Title } from '@solidjs/meta'
import { onCleanup, onMount } from 'solid-js'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'
import type { JSX } from 'solid-js'

export function Asset({
  tag,
  attrs,
  children,
}: RouterManagedTag): JSX.Element | null {
  switch (tag) {
    case 'title':
      return <Title {...attrs}>{children}</Title>
    case 'meta':
      return <Meta {...attrs} />
    case 'link':
      return <link {...attrs} />
    case 'style':
      return <Style {...attrs} innerHTML={children} />
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
      const existingScript = document.querySelector(
        `script[src="${attrs.src}"]`,
      )
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
    } else if (typeof children === 'string') {
      const existingScript = Array.from(
        document.querySelectorAll('script:not([src])'),
      ).find((script) => script.textContent === children)
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

  if (router && !router.isServer) {
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
