import type {
  AnyRedirect,
  Redirect,
  ResolvedRedirect,
} from '@tanstack/router-core'
import type { RegisteredRouter } from './router'

export function redirect<
  TRouter extends RegisteredRouter,
  const TTo extends string | undefined,
  const TFrom extends string = string,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  opts: Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> {
  ;(opts as any).isRedirect = true
  opts.statusCode = opts.statusCode || opts.code || 307
  opts.headers = opts.headers || {}
  if (!opts.reloadDocument) {
    opts.reloadDocument = false
    try {
      new URL(`${opts.href}`)
      opts.reloadDocument = true
    } catch {}
  }

  if (opts.throw) {
    throw opts
  }

  return opts
}

export function isRedirect(obj: any): obj is AnyRedirect {
  return !!obj?.isRedirect
}

export function isResolvedRedirect(obj: any): obj is ResolvedRedirect {
  return !!obj?.isRedirect && obj.href
}
