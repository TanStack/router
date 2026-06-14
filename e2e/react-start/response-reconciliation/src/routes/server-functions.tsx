import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import {
  createMiddleware,
  createServerFn,
  useServerFn,
} from '@tanstack/react-start'
import * as React from 'react'
import {
  getResponseHeader,
  setCookie,
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
} from '@tanstack/react-start/server'

const functionAfterNextMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  const result = await next()
  setResponseHeader('x-function-after', 'yes')
  setResponseStatus(236, 'function-after')
  return result
})

const rawResponseAfterNextMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  const result = await next()
  setResponseHeader('x-function-raw-after', 'yes')
  setResponseStatus(237, 'function-raw-after')
  return result
})

const throwStatusMiddleware = createMiddleware({
  type: 'function',
}).server(() => {
  setResponseStatus(401, 'Unauthorized')
  setResponseHeader('x-function-error-middleware', 'yes')
  throw new Error('Unauthorized function middleware')
})

const replacementMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  const result = await next()
  const resultWithResponse = result as typeof result & { result?: unknown }
  if (!(resultWithResponse.result instanceof Response)) {
    throw new Error('Expected replacement test to observe a Response')
  }
  resultWithResponse.result.headers.set('x-function-a', 'yes')
  setResponseHeader('x-function-helper-delta', 'yes')
  return new Response('function-b', {
    headers: { 'x-function-b': 'yes' },
  }) as any
})

const globalSerializedFn = createServerFn().handler(() => {
  return { ok: true }
})

const functionAfterNextFn = createServerFn()
  .middleware([functionAfterNextMiddleware])
  .handler(() => {
    return { ok: true }
  })

const rawResponseAfterNextFn = createServerFn()
  .middleware([rawResponseAfterNextMiddleware])
  .handler(() => {
    return new Response('raw function body', {
      headers: { 'x-function-raw': 'yes' },
    })
  })

const replacementFn = createServerFn()
  .middleware([replacementMiddleware])
  .handler(() => {
    return new Response('function-a')
  })

const multipleCookiesFn = createServerFn().handler(() => {
  setCookie('fn-one', '1', { path: '/' })
  setCookie('fn-two', '2', { path: '/' })
  return { ok: true }
})

const rawMultipleCookiesFn = createServerFn().handler(() => {
  setCookie('fn-raw-helper-one', '1', { path: '/' })
  setCookie('fn-raw-helper-two', '2', { path: '/' })
  const headers = new Headers()
  headers.append('set-cookie', 'fn-raw-returned-one=1; Path=/')
  headers.append('set-cookie', 'fn-raw-returned-two=2; Path=/')
  return new Response('raw cookie body', { headers })
})

const explicitCookieHeaderFn = createServerFn().handler(() => {
  setResponseHeader('set-cookie', [
    'fn-explicit-one=1; Path=/',
    'fn-explicit-two=2; Path=/',
  ])
  return { ok: true }
})

const throwAfterStatusFn = createServerFn().handler(() => {
  setResponseStatus(401, 'Unauthorized')
  setResponseHeader('x-function-error', 'yes')
  throw new Error('Unauthorized function')
})

const throwAfterMiddlewareStatusFn = createServerFn()
  .middleware([throwStatusMiddleware])
  .handler(() => {
    return { ok: true }
  })

const transportProtectedFn = createServerFn().handler(() => {
  setResponseHeaders(
    new Headers({
      'content-type': 'text/plain',
      'x-tss-serialized': 'false',
      'x-user-header': 'yes',
    }),
  )
  return { ok: true }
})

const readAfterSetFn = createServerFn().handler(() => {
  setResponseHeader('x-read-after-set', 'yes')
  setResponseHeader(
    'x-read-after-set-value',
    getResponseHeader('x-read-after-set') || 'missing',
  )
  return { ok: true }
})

export const Route = createFileRoute('/server-functions')({
  component: ServerFunctions,
})

function ServerFunctions() {
  return (
    <main>
      <h1>Server Functions</h1>
      <ClientOnly>
        <span data-testid="server-functions-hydrated" hidden />
      </ClientOnly>
      <ServerFunctionButton name="globalSerialized" fn={globalSerializedFn} />
      <ServerFunctionButton name="functionAfterNext" fn={functionAfterNextFn} />
      <ServerFunctionButton
        name="rawResponseAfterNext"
        fn={rawResponseAfterNextFn}
      />
      <ServerFunctionButton name="replacement" fn={replacementFn} />
      <ServerFunctionButton name="multipleCookies" fn={multipleCookiesFn} />
      <ServerFunctionButton
        name="rawMultipleCookies"
        fn={rawMultipleCookiesFn}
      />
      <ServerFunctionButton
        name="explicitCookieHeader"
        fn={explicitCookieHeaderFn}
      />
      <ServerFunctionButton name="throwAfterStatus" fn={throwAfterStatusFn} />
      <ServerFunctionButton
        name="throwAfterMiddlewareStatus"
        fn={throwAfterMiddlewareStatusFn}
      />
      <ServerFunctionButton
        name="transportProtected"
        fn={transportProtectedFn}
      />
      <ServerFunctionButton name="readAfterSet" fn={readAfterSetFn} />
    </main>
  )
}

function ServerFunctionButton({
  name,
  fn,
}: {
  name: string
  fn: (...args: Array<any>) => Promise<any>
}) {
  const serverFn = useServerFn(fn)
  const [result, setResult] = React.useState('idle')

  return (
    <div>
      <button
        type="button"
        data-testid={`server-function-${name}`}
        onClick={async () => {
          setResult('pending')
          try {
            const value = await serverFn()
            if (value instanceof Response) {
              setResult(`${value.status}:${await value.text()}`)
            } else {
              setResult(JSON.stringify(value))
            }
          } catch (error) {
            setResult(error instanceof Error ? error.message : 'error')
          }
        }}
      >
        {name}
      </button>
      <output data-testid={`server-function-${name}-result`}>{result}</output>
    </div>
  )
}
