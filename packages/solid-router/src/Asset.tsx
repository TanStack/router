import type { RouterManagedTag } from '@tanstack/router-core'
import { createEffect, onCleanup } from 'solid-js'
import type { JSX } from 'solid-js'
import { isServer } from 'solid-js/web'

const applyScriptAttributes = (
  script: HTMLScriptElement,
  attrs?: RouterManagedTag['attrs'],
) => {
  if (!attrs) return
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue
    script.setAttribute(key, value === true ? '' : String(value))
  }
}

const findScriptBySrc = (src: string) => {
  if (typeof document === 'undefined') return null
  const escape =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape
      : (value: string) => value.replace(/["\\]/g, '\\$&')
  return document.head.querySelector(
    `script[src="${escape(src)}"]`,
  ) as HTMLScriptElement | null
}

const findScriptByContent = (content: string) => {
  if (typeof document === 'undefined') return null
  const scripts = Array.from(
    document.head.querySelectorAll('script:not([src])'),
  ) as Array<HTMLScriptElement>
  return scripts.find((script) => script.textContent === content) ?? null
}

export function Asset({
  tag,
  attrs,
  children,
}: RouterManagedTag): JSX.Element | null {
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
      if (!isServer) {
        createEffect(() => {
          const src = typeof attrs?.src === 'string' ? attrs.src : undefined
          const inline =
            typeof children === 'string' ? children : undefined
          if (!src && !inline) return

          const existing = src
            ? findScriptBySrc(src)
            : findScriptByContent(inline ?? '')

          const shouldReuse =
            existing?.hasAttribute('data-hk') ||
            existing?.hasAttribute('data-tsr-executed')

          let script = existing
          if (!script || !shouldReuse) {
            script = document.createElement('script')
            applyScriptAttributes(script, attrs)
            if (inline !== undefined) {
              script.textContent = inline
            }
            script.setAttribute('data-tsr-executed', 'true')
            script.setAttribute('data-tsr-managed', 'true')
            document.head.appendChild(script)
            if (existing?.parentNode) {
              existing.parentNode.removeChild(existing)
            }
          } else {
            script.setAttribute('data-tsr-managed', 'true')
          }

          onCleanup(() => {
            if (script?.getAttribute('data-tsr-managed') === 'true') {
              script.remove()
            }
          })
        })
        return null
      }
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
