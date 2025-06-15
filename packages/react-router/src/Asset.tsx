import * as React from 'react'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

export function Asset({ tag, attrs, children }: RouterManagedTag): any {
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
          dangerouslySetInnerHTML={{ __html: children as any }}
        />
      )
    case 'script':
      return <ScriptAsset attrs={attrs} children={children} />
    default:
      return null
  }
}

function ScriptAsset({ attrs, children }: { attrs: any; children?: string }) {
  const router = useRouter()

  React.useEffect(() => {
    if (attrs?.src) {
      const script = document.createElement('script')

      Object.keys(attrs).forEach((key) => {
        if (key !== 'suppressHydrationWarning') {
          script.setAttribute(key, attrs[key])
        }
      })

      document.head.appendChild(script)

      return () => {
        if (script.parentNode) {
          script.parentNode.removeChild(script)
        }
      }
    } else if (typeof children === 'string') {
      const script = document.createElement('script')
      script.textContent = children

      if (attrs) {
        Object.keys(attrs).forEach((key) => {
          if (key !== 'suppressHydrationWarning') {
            script.setAttribute(key, attrs[key])
          }
        })
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

  if (router.isServer) {
    if (attrs?.src) {
      return <script {...attrs} suppressHydrationWarning />
    } else if (typeof children === 'string') {
      return (
        <script
          dangerouslySetInnerHTML={{ __html: children }}
          suppressHydrationWarning
        />
      )
    }
    return null
  }

  return null
}
