import type { NavigateOptions } from './link'
import type { AnyRouter, RegisteredRouter } from './router'

export type AnyRedirect = Redirect<any, any, any, any, any>

/**
 * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RedirectType)
 */
export type Redirect<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = Response & {
  options: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>
  redirectHandled?: boolean
}

export type RedirectOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = {
  href?: string
  /**
   * @deprecated Use `statusCode` instead
   **/
  code?: number
  /**
   * The HTTP status code to use when redirecting.
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RedirectType#statuscode-property)
   */
  statusCode?: number
  /**
   * If provided, will throw the redirect object instead of returning it. This can be useful in places where `throwing` in a function might cause it to have a return type of `never`. In that case, you can use `redirect({ throw: true })` to throw the redirect object instead of returning it.
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RedirectType#throw-property)
   */
  throw?: any
  /**
   * The HTTP headers to use when redirecting.
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RedirectType#headers-property)
   */
  headers?: HeadersInit
} & NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

export type ResolvedRedirect<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string = '',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

export function redirect<
  TRouter extends AnyRouter = RegisteredRouter,
  const TTo extends string | undefined = '.',
  const TFrom extends string = string,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  opts: RedirectOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> {
  opts.statusCode = opts.statusCode || opts.code || 307

  if (!opts.reloadDocument && typeof opts.href === 'string') {
    try {
      new URL(opts.href)
      opts.reloadDocument = true
    } catch {}
  }

  const headers = new Headers(opts.headers)
  if (opts.href && headers.get('Location') === null) {
    headers.set('Location', opts.href)
  }

  const response = new Response(null, {
    status: opts.statusCode,
    headers,
  })

  ;(response as Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>).options =
    opts

  if (opts.throw) {
    throw response
  }

  return response as Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>
}

export function isRedirect(obj: any): obj is AnyRedirect {
  return obj instanceof Response && !!(obj as any).options
}

export function isResolvedRedirect(
  obj: any,
): obj is AnyRedirect & { options: { href: string } } {
  return isRedirect(obj) && !!obj.options.href
}

export function parseRedirect(obj: any) {
  if (obj !== null && typeof obj === 'object' && obj.isSerializedRedirect) {
    return redirect(obj)
  }

  return undefined
}
