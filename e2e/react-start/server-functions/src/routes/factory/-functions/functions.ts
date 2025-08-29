import { createMiddleware } from '@tanstack/react-start'
import { createBarServerFn } from './createBarServerFn'
import { createFooServerFn } from './createFooServerFn'
import { createFakeFn } from './createFakeFn'

export const fooFn = createFooServerFn().handler(({ context }) => {
  return {
    name: 'fooFn',
    context,
  }
})

export const fooFnPOST = createFooServerFn({ method: 'POST' }).handler(
  ({ context }) => {
    return {
      name: 'fooFnPOST',
      context,
    }
  },
)

export const barFn = createBarServerFn().handler(({ context }) => {
  return {
    name: 'barFn',
    context,
  }
})

export const barFnPOST = createBarServerFn({ method: 'POST' }).handler(
  ({ context }) => {
    return {
      name: 'barFnPOST',
      context,
    }
  },
)

const localMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => {
    console.log('local middleware triggered')
    return next({
      context: { local: 'local' } as const,
    })
  },
)

const localFnFactory = createBarServerFn.middleware([localMiddleware])

const anotherMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => {
    console.log('another middleware triggered')
    return next({
      context: { another: 'another' } as const,
    })
  },
)

export const localFn = localFnFactory()
  .middleware([anotherMiddleware])
  .handler(({ context }) => {
    return {
      name: 'localFn',
      context,
    }
  })

export const localFnPOST = localFnFactory({ method: 'POST' })
  .middleware([anotherMiddleware])
  .handler(({ context }) => {
    return {
      name: 'localFnPOST',
      context,
    }
  })

export const fakeFn = createFakeFn().handler(async () => {
  return {
    name: 'fakeFn',
    window,
  }
})
