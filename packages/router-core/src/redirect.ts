import { pick } from './utils'
import type { NavigateOptions } from './link'
import type { RoutePaths } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'

export type AnyRedirect = Redirect<any, any, any, any, any>

/**
 * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RedirectType)
 */
export type Redirect<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = '/',
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = Response

export type RedirectOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = '/',
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
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
  TFrom extends RoutePaths<TRouter['routeTree']> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> = TFrom,
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
  ;(opts as any).isRedirect = true
  const status = opts.statusCode || opts.code || 307

  if (!opts.reloadDocument) {
    try {
      new URL(`${opts.href}`)
      opts.reloadDocument = true
    } catch {}
  }

  const headers = new Headers(opts.headers || {})
  headers.set(
    'X-Tanstack-Router-Navigate-Options',
    JSON.stringify(
      pick(opts, ['ignoreBlocker', 'reloadDocument', 'replace', 'resetScroll']),
    ),
  )

  // If we already have a href, set it in the headers
  if (opts.href) headers.set('Location', opts.href)

  const response = new Response(null, {
    status,
    headers,
  })

  ;(response as any).__options = opts

  if (opts.throw) {
    throw response
  }

  return response
}

export function isRedirect(obj: any): obj is AnyRedirect {
  return (
    obj instanceof Response &&
    !!obj.headers.get('X-Tanstack-Router-Navigate-Options')
  )
}

export function isResolvedRedirect(obj: any): obj is Redirect {
  return isRedirect(obj) && !!obj.headers.get('Location')
}

export function getRedirectOptions(obj: AnyRedirect): RedirectOptions {
  const header = obj.headers.get('X-Tanstack-Router-Navigate-Options')
  if (!header) {
    throw new Error('No redirect options found')
  }
  return {
    ...JSON.parse(header),
    ...(obj as any).__options,
  }
}

export function updateRedirectOptions<TRedirect extends AnyRedirect>(
  redirect: TRedirect,
  opts: Partial<RedirectOptions>,
): TRedirect {
  redirect.headers.set(
    'X-Tanstack-Router-Navigate-Options',
    JSON.stringify({
      ...getRedirectOptions(redirect),
      ...pick(opts, [
        'ignoreBlocker',
        'reloadDocument',
        'replace',
        'resetScroll',
      ]),
    }),
  )
  ;(redirect as any).__options = {
    ...(redirect as any).__options,
    ...opts,
  }

  return redirect
}
