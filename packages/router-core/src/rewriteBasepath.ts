import { joinPaths, trimPath } from './path'
import type { LocationRewrite } from './router'

export function rewriteBasepath(
  basepath: string,
  rewrite?: LocationRewrite,
  opts?: {
    caseSensitive?: boolean
  },
): LocationRewrite {
  const trimmedBasepath = trimPath(basepath)
  return {
    fromHref: ({ href }) => {
      const url = new URL(href)
      url.pathname = url.pathname.replace(
        new RegExp(`^/${trimmedBasepath}/`, opts?.caseSensitive ? '' : 'i'),
        '/',
      )
      return rewrite?.fromHref ? rewrite.fromHref({ href: url.href }) : url.href
    },
    toHref: ({ href }) => {
      const url = new URL(href)
      url.pathname = joinPaths(['/', trimmedBasepath, url.pathname])
      return rewrite?.toHref ? rewrite.toHref({ href: url.href }) : url.href
    },
  }
}
