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
    fromURL: ({ url }) => {
      url.pathname = url.pathname.replace(regex, '/')
      return rewrite?.fromURL ? rewrite.fromURL({ url }) : url
    },
    toURL: ({ url }) => {
      url.pathname = joinPaths(['/', trimmedBasepath, url.pathname])
      return rewrite?.toURL ? rewrite.toURL({ url }) : url
    },
  } satisfies LocationRewrite
}

export function executefromURL(
  rewrite: LocationRewrite | undefined,
  url: URL,
): URL {
  const res = rewrite?.fromURL?.({ url })
  if (res) {
    if (typeof res === 'string') {
      return new URL(res)
    } else if (res instanceof URL) {
      return res
    }
  }
  return url
}

export function executetoURL(
  rewrite: LocationRewrite | undefined,
  url: URL,
): URL {
  const res = rewrite?.toURL?.({ url })
  if (res) {
    if (typeof res === 'string') {
      return new URL(res)
    } else if (res instanceof URL) {
      return res
    }
  }
  return url
}
