import * as React from 'react'
import type { RouterManagedTag } from '@tanstack/router-core'

const ScriptCache = new Map<string, Promise<void>>()
const LoadCache = new Set<string>()

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

const loadScript = (attrs?: ScriptAttrs, children?: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const cacheKey = attrs?.src || children || ''

    if (cacheKey && LoadCache.has(cacheKey)) {
      resolve()
      return
    }

    if (attrs?.src && ScriptCache.has(attrs.src)) {
      LoadCache.add(cacheKey)
      const existingPromise = ScriptCache.get(attrs.src)
      if (existingPromise) {
        existingPromise.then(resolve, reject)
      }
      return
    }

    const script = document.createElement('script')

    const afterLoad = () => {
      LoadCache.add(cacheKey)
      resolve()
    }

    if (attrs?.src) {
      const loadPromise = new Promise<void>((resolveLoad, rejectLoad) => {
        script.addEventListener('load', () => {
          resolveLoad()
          afterLoad()
        })
        script.addEventListener('error', rejectLoad)
      })

      ScriptCache.set(attrs.src, loadPromise)

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

      if (typeof attrs.src === 'string') {
        script.src = attrs.src
      }
      document.head.appendChild(script)

      loadPromise.then(resolve, reject)
    } else if (typeof children === 'string') {
      script.textContent = children

      if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
          if (key !== 'suppressHydrationWarning' && value) {
            script.setAttribute(key, String(value))
          }
        }
      }

      document.head.appendChild(script)
      afterLoad()
    } else {
      resolve()
    }
  })
}

const initializeScriptCache = () => {
  if (typeof document !== 'undefined') {
    const existingScripts = Array.from(document.querySelectorAll('script[src]'))
    for (const script of existingScripts) {
      const src = script.getAttribute('src')
      if (src) {
        LoadCache.add(src)
      }
    }

    const existingInlineScripts = Array.from(
      document.querySelectorAll('script:not([src])'),
    )
    for (const script of existingInlineScripts) {
      if (script.textContent) {
        LoadCache.add(script.textContent)
      }
    }
  }
}

function Script({
  attrs,
  children,
}: {
  attrs?: ScriptAttrs
  children?: string
}) {
  const hasLoadScriptEffectCalled = React.useRef(false)

  React.useEffect(() => {
    if (!hasLoadScriptEffectCalled.current) {
      initializeScriptCache()

      loadScript(attrs, children).catch((error) => {
        console.error('Script loading failed:', error)
      })

      hasLoadScriptEffectCalled.current = true
    }
  }, [attrs, children])

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
