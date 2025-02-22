import { test } from 'vitest'
import * as h3 from 'h3'
import * as tssServer from '../src'

interface Foo {
  a: string
}

type AnyFn = (...args: Array<any>) => any
type Satisfies<T extends TConstraint, TConstraint> = T
type Tail<T> = T extends [any, ...infer U] ? U : never
type PrependOverload<
  TOriginal extends (...args: Array<any>) => any,
  TOverload extends (...args: Array<any>) => any,
> = TOverload & TOriginal

type SharedKeys = keyof typeof tssServer & keyof typeof h3
// things we're not wrapping
type KeysToIgnore = Satisfies<
  | 'H3Error'
  | 'H3Event'
  | 'MIMES'
  | 'callNodeListener'
  | 'createApp'
  | 'createAppEventHandler'
  | 'createError'
  | 'createEvent'
  | 'createRouter'
  | 'defineEventHandler'
  | 'defineLazyEventHandler'
  | 'defineNodeListener'
  | 'defineNodeMiddleware'
  | 'defineRequestMiddleware'
  | 'defineResponseMiddleware'
  | 'defineWebSocket'
  | 'dynamicEventHandler'
  | 'eventHandler'
  | 'fromNodeMiddleware'
  | 'fromPlainHandler'
  | 'fromWebHandler'
  | 'isCorsOriginAllowed'
  | 'isError'
  | 'isEvent'
  | 'isEventHandler'
  | 'isStream'
  | 'isWebResponse'
  | 'lazyEventHandler'
  | 'promisifyNodeListener'
  | 'sanitizeStatusCode'
  | 'sanitizeStatusMessage'
  | 'serveStatic'
  | 'splitCookiesString'
  | 'toEventHandler'
  | 'toNodeListener'
  | 'toPlainHandler'
  | 'toWebHandler'
  | 'toWebRequest'
  | 'useBase',
  SharedKeys
>

function expectWrappersToMatchH3<
  TFnMap extends Record<Exclude<SharedKeys, KeysToIgnore>, AnyFn>,
>(_map: {
  [K in keyof TFnMap]: {
    h3: TFnMap[K]
    tss: TFnMap[K] extends AnyFn
      ? PrependOverload<
          TFnMap[K],
          (...args: Tail<Parameters<TFnMap[K]>>) => ReturnType<TFnMap[K]>
        >
      : never
  }
}) {
  /* equivalent to the below for each key

  expectTypeOf<Parameters<typeof h3Function>>().toMatchTypeOf<
    OverloadParameters<typeof tssFunction>
  >()
  expectTypeOf<Tail<Parameters<typeof h3Function>>>().toMatchTypeOf<
    OverloadParameters<typeof tssFunction>
  >()

  expectTypeOf(tssFunction).returns.toEqualTypeOf<
    ReturnType<typeof h3Function>
  >()
    
  */
}

test('wrappers match original', () => {
  expectWrappersToMatchH3({
    readRawBody: {
      h3: h3.readRawBody<'hex'>,
      tss: tssServer.readRawBody<'hex'>,
    },
    readBody: {
      h3: h3.readBody<Foo>,
      tss: tssServer.readBody<Foo>,
    },
    getQuery: {
      h3: h3.getQuery<Foo>,
      tss: tssServer.getQuery<Foo>,
    },
    isMethod: {
      h3: h3.isMethod,
      tss: tssServer.isMethod,
    },
    isPreflightRequest: {
      h3: h3.isPreflightRequest,
      tss: tssServer.isPreflightRequest,
    },
    getValidatedQuery: {
      h3: h3.getValidatedQuery<Foo>,
      tss: tssServer.getValidatedQuery<Foo>,
    },
    getRouterParams: {
      h3: h3.getRouterParams,
      tss: tssServer.getRouterParams,
    },
    getRouterParam: {
      h3: h3.getRouterParam,
      tss: tssServer.getRouterParam,
    },
    getValidatedRouterParams: {
      h3: h3.getValidatedRouterParams<Foo>,
      tss: tssServer.getValidatedRouterParams<Foo>,
    },
    assertMethod: {
      h3: h3.assertMethod,
      tss: tssServer.assertMethod,
    },
    getRequestHeaders: {
      h3: h3.getRequestHeaders,
      tss: tssServer.getRequestHeaders,
    },
    getRequestHeader: {
      h3: h3.getRequestHeader,
      tss: tssServer.getRequestHeader,
    },
    getRequestURL: {
      h3: h3.getRequestURL,
      tss: tssServer.getRequestURL,
    },
    getRequestHost: {
      h3: h3.getRequestHost,
      tss: tssServer.getRequestHost,
    },
    getRequestProtocol: {
      h3: h3.getRequestProtocol,
      tss: tssServer.getRequestProtocol,
    },
    getRequestIP: {
      h3: h3.getRequestIP,
      tss: tssServer.getRequestIP,
    },
    send: {
      h3: h3.send,
      tss: tssServer.send,
    },
    sendNoContent: {
      h3: h3.sendNoContent,
      tss: tssServer.sendNoContent,
    },
    setResponseStatus: {
      h3: h3.setResponseStatus,
      tss: tssServer.setResponseStatus,
    },
    getResponseStatus: {
      h3: h3.getResponseStatus,
      tss: tssServer.getResponseStatus,
    },
    getResponseStatusText: {
      h3: h3.getResponseStatusText,
      tss: tssServer.getResponseStatusText,
    },
    getResponseHeaders: {
      h3: h3.getResponseHeaders,
      tss: tssServer.getResponseHeaders,
    },
    getResponseHeader: {
      h3: h3.getResponseHeader,
      tss: tssServer.getResponseHeader,
    },
    setResponseHeaders: {
      h3: h3.setResponseHeaders,
      tss: tssServer.setResponseHeaders,
    },
    setResponseHeader: {
      h3: h3.setResponseHeader<'Age'>,
      tss: tssServer.setResponseHeader<'Age'>,
    },
    appendResponseHeaders: {
      h3: h3.appendResponseHeaders,
      tss: tssServer.appendResponseHeaders,
    },
    appendResponseHeader: {
      h3: h3.appendResponseHeader<'Age'>,
      tss: tssServer.appendResponseHeader<'Age'>,
    },
    defaultContentType: {
      h3: h3.defaultContentType,
      tss: tssServer.defaultContentType,
    },
    sendRedirect: {
      h3: h3.sendRedirect,
      tss: tssServer.sendRedirect,
    },
    sendStream: {
      h3: h3.sendStream,
      tss: tssServer.sendStream,
    },
    writeEarlyHints: {
      h3: h3.writeEarlyHints,
      tss: tssServer.writeEarlyHints,
    },
    sendError: {
      h3: h3.sendError,
      tss: tssServer.sendError,
    },
    sendProxy: {
      h3: h3.sendProxy,
      tss: tssServer.sendProxy,
    },
    proxyRequest: {
      h3: h3.proxyRequest,
      tss: tssServer.proxyRequest,
    },
    fetchWithEvent: {
      h3: h3.fetchWithEvent<Foo, Foo, typeof fetch>,
      tss: tssServer.fetchWithEvent<Foo, Foo, typeof fetch>,
    },
    getProxyRequestHeaders: {
      h3: h3.getProxyRequestHeaders,
      tss: tssServer.getProxyRequestHeaders,
    },
    parseCookies: {
      h3: h3.parseCookies,
      tss: tssServer.parseCookies,
    },
    getCookie: {
      h3: h3.getCookie,
      tss: tssServer.getCookie,
    },
    setCookie: {
      h3: h3.setCookie,
      tss: tssServer.setCookie,
    },
    deleteCookie: {
      h3: h3.deleteCookie,
      tss: tssServer.deleteCookie,
    },
    useSession: {
      h3: h3.useSession<Foo>,
      tss: tssServer.useSession<Foo>,
    },
    getSession: {
      h3: h3.getSession<Foo>,
      tss: tssServer.getSession<Foo>,
    },
    updateSession: {
      h3: h3.updateSession<Foo>,
      tss: tssServer.updateSession<Foo>,
    },
    sealSession: {
      h3: h3.sealSession<Foo>,
      tss: tssServer.sealSession<Foo>,
    },
    unsealSession: {
      h3: h3.unsealSession,
      tss: tssServer.unsealSession,
    },
    clearSession: {
      h3: h3.clearSession,
      tss: tssServer.clearSession,
    },
    handleCacheHeaders: {
      h3: h3.handleCacheHeaders,
      tss: tssServer.handleCacheHeaders,
    },
    handleCors: {
      h3: h3.handleCors,
      tss: tssServer.handleCors,
    },
    appendCorsHeaders: {
      h3: h3.appendCorsHeaders,
      tss: tssServer.appendCorsHeaders,
    },
    appendCorsPreflightHeaders: {
      h3: h3.appendCorsPreflightHeaders,
      tss: tssServer.appendCorsPreflightHeaders,
    },
    sendWebResponse: {
      h3: h3.sendWebResponse,
      tss: tssServer.sendWebResponse,
    },
    appendHeader: {
      h3: h3.appendHeader<'Age'>,
      tss: tssServer.appendHeader<'Age'>,
    },
    appendHeaders: {
      h3: h3.appendHeaders,
      tss: tssServer.appendHeaders,
    },
    setHeader: {
      h3: h3.setHeader<'Age'>,
      tss: tssServer.setHeader<'Age'>,
    },
    setHeaders: {
      h3: h3.setHeaders,
      tss: tssServer.setHeaders,
    },
    getHeader: {
      h3: h3.getHeader,
      tss: tssServer.getHeader,
    },
    getHeaders: {
      h3: h3.getHeaders,
      tss: tssServer.getHeaders,
    },
    getRequestFingerprint: {
      h3: h3.getRequestFingerprint,
      tss: tssServer.getRequestFingerprint,
    },
    getRequestWebStream: {
      h3: h3.getRequestWebStream,
      tss: tssServer.getRequestWebStream,
    },
    readFormData: {
      h3: h3.readFormData,
      tss: tssServer.readFormData,
    },
    readMultipartFormData: {
      h3: h3.readMultipartFormData,
      tss: tssServer.readMultipartFormData,
    },
    readValidatedBody: {
      h3: h3.readValidatedBody<Foo>,
      tss: tssServer.readValidatedBody<Foo>,
    },
    removeResponseHeader: {
      h3: h3.removeResponseHeader,
      tss: tssServer.removeResponseHeader,
    },
    clearResponseHeaders: {
      h3: h3.clearResponseHeaders,
      tss: tssServer.clearResponseHeaders,
    },
  })
})
