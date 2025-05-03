import { Meta, Style, Title } from '@solidjs/meta'
import type { RouterManagedTag } from '@tanstack/router-core'

export function Asset({ tag, attrs, children }: RouterManagedTag): any {
  const safeAttrs = Object.fromEntries(
    Object.entries(attrs || {}).filter(
      ([key, value]) =>
        !/^on/.test(key) || typeof value === 'function' || value === undefined
    )
  );

  switch (tag) {
    case 'title':
      return <Title {...attrs}>{children}</Title>
    case 'meta':
      return <Meta {...safeAttrs} />
    case 'link':
      return (
        <link {...safeAttrs} />
      )
    case 'style':
      return <Style {...attrs} innerHTML={children} />
    case 'script':
      if ((attrs as any) && (attrs as any).src) {
        return <script {...attrs} />
      }
      if (typeof children === 'string')
        return <script {...attrs} innerHTML={children} />
      return null
    default:
      return null
  }
}
