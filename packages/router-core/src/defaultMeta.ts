import type { RouterManagedTag } from '@tanstack/router-core'

const defaultMeta: Array<{
  key: string
  tag: 'meta'
  matcher: (m: any) => boolean
  attrs: Record<string, string>
}> = [
  {
    key: 'charSet',
    tag: 'meta',
    matcher: (m) => m?.charSet != null,
    attrs: { charSet: 'utf-8' },
  },
  {
    key: 'viewport',
    tag: 'meta',
    matcher: (m) => m?.name === 'viewport',
    attrs: {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1',
    },
  },
]

export function applyDefaultMeta(
  routeMeta: Array<Array<any>>,
  resultMeta: Array<RouterManagedTag>,
  metaByAttribute: Record<string, boolean>,
) {
  for (const { key, matcher, tag, attrs } of defaultMeta) {
    const already = routeMeta.flat(1).some(matcher)
    if (!already) {
      resultMeta.push({ tag, attrs })
      metaByAttribute[key] = true
    }
  }
}
