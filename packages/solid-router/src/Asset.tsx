import { Meta, Style, Title } from '@solidjs/meta'
import { onMount } from 'solid-js'
import type { RouterManagedTag } from '@tanstack/router-core'
import type { JSX } from 'solid-js'

const ScriptCache = new Map<string, Promise<void>>()
const LoadCache = new Set<string>()

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
  [key: string]: string | undefined
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
        if (value) {
          script.setAttribute(key, value)
        }
      }

      script.src = attrs.src
      document.head.appendChild(script)

      loadPromise.then(resolve, reject)
    } else if (typeof children === 'string') {
      script.textContent = children

      if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
          if (value) {
            script.setAttribute(key, value)
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
    const existingScripts = document.querySelectorAll('script[src]')
    for (const script of existingScripts) {
      const src = script.getAttribute('src')
      if (src) {
        LoadCache.add(src)
      }
    }

    const existingInlineScripts = document.querySelectorAll('script:not([src])')
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
}): JSX.Element | null {
  onMount(() => {
    initializeScriptCache()

    loadScript(attrs, children).catch((error) => {
      console.error('Script loading failed:', error)
    })
  })

  if (typeof document === 'undefined') {
    if (attrs?.src && typeof attrs.src === 'string') {
      return <script {...attrs} />
    }

    if (typeof children === 'string') {
      return <script {...attrs} innerHTML={children} />
    }
  }

  return null
}
