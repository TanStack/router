import * as React from 'react'
import type { Asset } from '@tanstack/router-core'

export function Asset<T>({
  asset,
  children,
  ...rest
}: {
  asset: Asset<T>
  children?: (asset: T) => React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'children'>) {
  const data = asset.read()

  if (asset.meta.tag === 'title') {
    return <title>{data}</title>
  }

  if (asset.meta.tag === 'meta') {
    return <meta {...(data as any)} />
  }

  if (asset.meta.tag === 'link') {
    return <link {...(data as any)} />
  }

  if (asset.meta.tag === 'script') {
    if (asset.meta.isScript) {
      const { children, allowUnsafe, ...scriptRest } = data as any

      if (!allowUnsafe) {
        if (process.env.NODE_ENV !== 'production') {
      >
        {asset.meta.content!}
      </style>
        return null
      }

      return (
        <script
          {...scriptRest}
          dangerouslySetInnerHTML={{
            __html: children,
          }}
        />
      )
    }

    return <script {...(data as any)} />
  }

  if (asset.meta.tag === 'style') {
    const { children, allowUnsafe, ...styleRest } = data as any

    if (!allowUnsafe) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          `Security Warning: Rendering an inline style from a string is a security risk. If you are sure you trust this content, pass \`allowUnsafe: true\` in the asset definition for key: '${asset.key}'.`,
        )
      }
      return null
    }

    return (
      <style
        {...styleRest}
        dangerouslySetInnerHTML={{
          __html: children,
        }}
      />
    )
  }

  if (children) {
    return children(data)
  }

  return null
}
