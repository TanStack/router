import { Meta, Style, Title } from '@solidjs/meta'
import { createEffect, onCleanup } from 'solid-js'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

export function Asset({ tag, attrs, children }: RouterManagedTag): any {
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
      return <ScriptAsset attrs={attrs} children={children} />
    default:
      return null
  }
}

function ScriptAsset({ attrs, children }: { attrs: any; children?: string }) {
  const router = useRouter()

  if (router.isServer) {
    if (attrs?.src) {
      return <script {...attrs} />
    } else if (typeof children === 'string') {
      return <script {...attrs} innerHTML={children} />
    }
    return null
  }

  createEffect(() => {
    if (attrs?.src) {
      const script = document.createElement('script')

      Object.keys(attrs).forEach((key) => {
        script.setAttribute(key, attrs[key])
      })

      document.head.appendChild(script)

      onCleanup(() => {
        if (script.parentNode) {
          script.parentNode.removeChild(script)
        }
      })
    } else if (typeof children === 'string') {
      const script = document.createElement('script')
      script.textContent = children

      if (attrs) {
        Object.keys(attrs).forEach((key) => {
          script.setAttribute(key, attrs[key])
        })
      }

      document.head.appendChild(script)

      onCleanup(() => {
        if (script.parentNode) {
          script.parentNode.removeChild(script)
        }
      })
    }
  })

  return null
}
