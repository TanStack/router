import type { RouterManagedTag } from '@tanstack/router-core'
import type { JSX } from 'solid-js'

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
