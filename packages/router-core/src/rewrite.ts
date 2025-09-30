import { joinPaths, trimPath } from './path'
import type { LocationRewrite } from './router'

export function composeRewrites(rewrites: Array<LocationRewrite>) {
  return {
    input: ({ url }) => {
      for (const rewrite of rewrites) {
        url = executeRewriteInput(rewrite, url)
      }
      return url
    },
    output: ({ url }) => {
      for (let i = rewrites.length - 1; i >= 0; i--) {
        url = executeRewriteOutput(rewrites[i], url)
      }
      return url
    },
  } satisfies LocationRewrite
}

export function rewriteBasepath(opts: {
  basepath: string
  caseSensitive?: boolean
}) {
  const trimmedBasepath = trimPath(opts.basepath)
  const regex = new RegExp(
    `^/${trimmedBasepath}(?:/|$)`,
    opts.caseSensitive ? '' : 'i',
  )
  return {
    input: ({ url }) => {
      url.pathname = url.pathname.replace(regex, '/')
      return url
    },
    output: ({ url }) => {
      url.pathname = joinPaths(['/', trimmedBasepath, url.pathname])
      return url
    },
  } satisfies LocationRewrite
}

export function executeRewriteInput(
  rewrite: LocationRewrite | undefined,
  url: URL,
): URL {
  const res = rewrite?.input?.({ url })
  if (res) {
    if (typeof res === 'string') {
      return new URL(res)
    } else if (res instanceof URL) {
      return res
    }
  }
  return url
}

export function executeRewriteOutput(
  rewrite: LocationRewrite | undefined,
  url: URL,
): URL {
  const res = rewrite?.output?.({ url })
  if (res) {
    if (typeof res === 'string') {
      return new URL(res)
    } else if (res instanceof URL) {
      return res
    }
  }
  return url
}
