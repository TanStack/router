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
        fromRequest?: string
      }
    }
  }
}

// const someReqMw = createMiddleware().server(({ next, context }) => {
//   context?.fromRequest
//   return next({
//     context: { fromGlobalReqMiddleware: 'hello from the request middleware!' },
//   })
// })

const someMw = createMiddleware({ type: 'function' }).server(
  ({ next, context }) => {
    context?.fromRequest
    return next({
      context: { fromGlobalFnMiddleware: 'hello from the server middleware!' },
    })
  },
)

// createMiddleware().server(({ next, context }) => {
//   context.fromRequest
//   context.fromGlobalReqMiddleware
//   return next()
// })

createMiddleware({ type: 'function' }).server(({ next, context }) => {
  context.fromRequest
  context.fromGlobalReqMiddleware
  context.fromGlobalFnMiddleware
  return next()
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
    // requestMiddleware: [someReqMw],
    // functionMiddleware: [someMw],
  })
}
