import * as React from 'react'
import type { RouterManagedTag } from './RouterManagedTag'

export function Asset({ tag, attrs, children }: RouterManagedTag): any {
  switch (tag) {
    case 'title':
      return <title {...attrs}>{children}</title>
    case 'meta':
      return <meta {...attrs} />
    case 'link':
      return <link {...attrs} />
    case 'style':
      return <style {...attrs} dangerouslySetInnerHTML={{ __html: children }} />
    case 'script':
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (attrs && attrs.src) {
        return <script {...attrs} suppressHydrationWarning />
      }
      if (typeof children === 'string')
        return (
          <script
            {...attrs}
            dangerouslySetInnerHTML={{
              __html: children,
            }}
            suppressHydrationWarning
          />
        )
      return null
    default:
      return null
  }
}
