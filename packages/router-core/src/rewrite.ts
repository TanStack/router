import { joinPaths, trimPath } from './path'
import type { LocationRewrite } from './router'

export function rewriteBasepath(
  basepath: string,
  rewrite?: LocationRewrite,
  opts?: {
    caseSensitive?: boolean
  },
) {
  const trimmedBasepath = trimPath(basepath)
  const regex = new RegExp(
    `^/${trimmedBasepath}/`,
    opts?.caseSensitive ? '' : 'i',
  )
  return {
    fromHref: ({ href }) => {
      const url = new URL(href)
      url.pathname = url.pathname.replace(regex, '/')
      return rewrite?.fromHref ? rewrite.fromHref({ href: url.href }) : url
    },
    toHref: ({ href }) => {
      const url = new URL(href)
      url.pathname = joinPaths(['/', trimmedBasepath, url.pathname])
      return rewrite?.toHref ? rewrite.toHref({ href: url.href }) : url
    },
  } satisfies LocationRewrite
}

export function executeFromHref(
  rewrite: LocationRewrite | undefined,
  href: string,
): URL {
  const res = rewrite?.fromHref?.({ href })
  if (res) {
    if (typeof res === 'string') {
      return new URL(res)
    } else if (res instanceof URL) {
      return res
    }
  }
  return new URL(href)
}

export function executeToHref(
  rewrite: LocationRewrite | undefined,
  href: string,
): string {
  const res = rewrite?.toHref?.({ href })
  if (res) {
    if (typeof res === 'string') {
      return res
    } else if (res instanceof URL) {
      return res.href
    }
  }
  return href
}
