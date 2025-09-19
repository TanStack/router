import {
  createRouter,
  createSerializationAdapter,
} from '@tanstack/react-router'
import { createMiddleware, createStart } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import { Foo } from './Foo'

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  })

  return router
}

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: {
        hello1?: string
      }
    }
  }
}

const someMw = createMiddleware({ type: 'function' }).server(({ next }) => {
  return next({
    context: { serverMiddlewareValue: 'hello from the server middleware!' },
  })
})

const someReqMw = createMiddleware().server(({ next }) => {
  return next({ context: { requestMw: 'hello from the request middleware!' } })
})

const fooAdapter = createSerializationAdapter({
  key: 'foo',
  test: (value: any) => value instanceof Foo,
  toSerializable: (foo) => foo.bar(),
  fromSerializable: (value) => new Foo(value),
})

export function getStart() {
  return createStart({
    defaultSsr: true,
    serializationAdapters: [fooAdapter],
    requestMiddleware: [someReqMw],
    functionMiddleware: [someMw],
  })
}
