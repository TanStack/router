import type { RouterManagedTag } from '@tanstack/router-core'
import type { JSX } from 'solid-js'

export function Asset({
  tag,
  attrs,
  children,
}: RouterManagedTag): JSX.Element | null {
  switch (tag) {
    case 'title':
      return <title {...attrs}>{children as string}</title>
    case 'meta':
      return <meta {...attrs} />
    case 'link':
      return <link {...attrs} />
    case 'style':
      return <style {...attrs} innerHTML={children as string} />
    case 'script':
      if (typeof children === 'string') {
        return <script {...attrs} innerHTML={children} />
      }
      return <script {...attrs} />
    default:
      return null
  }
}
