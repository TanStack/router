import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { createBarServerFn } from './createBarServerFn'
import { createFooServerFn } from './createFooServerFn'
import { createFakeFn } from './createFakeFn'
// Test re-export syntax: `export { foo } from './module'`
import { reexportFactory } from './reexportIndex'
// Test star re-export syntax: `export * from './module'`
import { starReexportFactory } from './starReexportIndex'
// Test nested star re-export syntax: A -> B -> C chain
import { nestedReexportFactory } from './nestedReexportA'

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

export const composeFactory = createServerFn({ method: 'GET' }).middleware([
  createBarServerFn,
])
export const composedFn = composeFactory()
  .middleware([anotherMiddleware, localFnFactory])
  .handler(({ context }) => {
    return {
      name: 'composedFn',
      context,
    }
  })

// Test that re-exported factories (using `export { foo } from './module'`) work correctly
// The middleware from reexportFactory should execute and add { reexport: 'reexport-middleware-executed' } to context
export const reexportedFactoryFn = reexportFactory().handler(({ context }) => {
  return {
    name: 'reexportedFactoryFn',
    context,
  }
})

// Test that star re-exported factories (using `export * from './module'`) work correctly
// The middleware from starReexportFactory should execute and add { starReexport: 'star-reexport-middleware-executed' } to context
export const starReexportedFactoryFn = starReexportFactory().handler(
  ({ context }) => {
    return {
      name: 'starReexportedFactoryFn',
      context,
    }
  },
)

// Test that nested star re-exported factories (A -> B -> C chain) work correctly
// The middleware from nestedReexportFactory should execute and add { nested: 'nested-middleware-executed' } to context
export const nestedReexportedFactoryFn = nestedReexportFactory().handler(
  ({ context }) => {
    return {
      name: 'nestedReexportedFactoryFn',
      context,
    }
  },
)
