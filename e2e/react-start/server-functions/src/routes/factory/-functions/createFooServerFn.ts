import { createMiddleware, createServerFn } from '@tanstack/react-start'

const fooMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => {
    console.log('Foo middleware triggered')
    return next({
      context: { foo: 'foo' } as const,
    })
  },
)

export const createFooServerFn = createServerFn().middleware([fooMiddleware])

export const fooFnInsideFactoryFile = createFooServerFn().handler(
  async ({ context, method }) => {
    console.log('fooFnInsideFactoryFile handler triggered', method)
    return {
      name: 'fooFnInsideFactoryFile',
      context,
    }
  },
)
