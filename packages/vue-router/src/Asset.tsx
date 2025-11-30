import type { RouterManagedTag } from '@tanstack/router-core'

export function Asset({ tag, attrs, children }: RouterManagedTag): any {
  switch (tag) {
    case 'title':
      return (
        <title {...attrs} >
          {children}
        </title>
      )
    case 'meta':
      return <meta {...attrs}  />
    case 'link':
      return <link {...attrs}  />
    case 'style':
      return (
        <style
          {...attrs}
          innerHTML={children}
        />
      )
    case 'script':
      if ((attrs as any) && (attrs as any).src) {
        return <script {...attrs}  />
      }
      if (typeof children === 'string')
        return (
          <script
            {...attrs}
            innerHTML={children}
            
          />
        )
      return null
    default:
      return null
  }
}
