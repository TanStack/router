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
      if ((attrs as any) && (attrs as any).src) {
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
