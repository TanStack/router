import { describe, expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createStart } from '../createStart'

/**
 * These tests verify that `startInstance.createServerFn` and
 * `startInstance.createMiddleware` carry the global middleware context
 * types from the Start instance's own generic parameters, without
 * requiring the consumer to have access to the app's `Register`
 * module augmentation.
 *
 * This is the key feature for monorepo setups where feature packages
 * need typed server function and middleware context from global middleware.
 */

const localeMiddleware = createMiddleware({ type: 'request' }).server(
  ({ next }) => {
    return next({
      context: {
        locale: 'en-us' as string,
      },
    })
  },
)

const authMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => {
    return next({
      context: {
        user: { id: '123' as string, role: 'admin' as string },
      },
    })
  },
)

describe('startInstance.createServerFn', () => {
  test('carries request middleware context types', () => {
    const startInstance = createStart(() => ({
      requestMiddleware: [localeMiddleware],
    }))

    startInstance.createServerFn({ method: 'GET' }).handler((options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        locale: string
      }>()
    })
  })

  test('carries function middleware context types', () => {
    const startInstance = createStart(() => ({
      functionMiddleware: [authMiddleware],
    }))

    startInstance.createServerFn({ method: 'GET' }).handler((options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        user: { id: string; role: string }
      }>()
    })
  })

  test('carries both request and function middleware context', () => {
    const startInstance = createStart(() => ({
      requestMiddleware: [localeMiddleware],
      functionMiddleware: [authMiddleware],
    }))

    startInstance.createServerFn({ method: 'GET' }).handler((options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        locale: string
        user: { id: string; role: string }
      }>()
    })
  })

  test('allows chaining additional middleware', () => {
    const startInstance = createStart(() => ({
      requestMiddleware: [localeMiddleware],
    }))

    const extraMiddleware = createMiddleware({ type: 'function' }).server(
      ({ next }) => {
        return next({
          context: {
            extra: 'value' as string,
          },
        })
      },
    )

    startInstance
      .createServerFn({ method: 'GET' })
      .middleware([extraMiddleware])
      .handler((options) => {
        expectTypeOf(options.context).toEqualTypeOf<{
          locale: string
          extra: string
        }>()
      })
  })

  test('supports factory pattern via call signature', () => {
    const startInstance = createStart(() => ({
      requestMiddleware: [localeMiddleware],
      functionMiddleware: [authMiddleware],
    }))

    // Create a factory by calling createServerFn then middleware
    const factory = startInstance
      .createServerFn({ method: 'GET' })
      .middleware([])

    // Use the factory's call signature to create new server fns
    factory().handler((options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        locale: string
        user: { id: string; role: string }
      }>()
    })
  })

  test('context is undefined when no middleware is configured', () => {
    const startInstance = createStart(() => ({}))

    startInstance.createServerFn({ method: 'GET' }).handler((options) => {
      expectTypeOf(options.context).toEqualTypeOf<undefined>()
    })
  })

  test('preserves method type', () => {
    const startInstance = createStart(() => ({
      requestMiddleware: [localeMiddleware],
    }))

    startInstance.createServerFn({ method: 'POST' }).handler((options) => {
      expectTypeOf(options.method).toEqualTypeOf<'POST'>()
    })
  })

  test('supports input validator', () => {
    const startInstance = createStart(() => ({
      requestMiddleware: [localeMiddleware],
    }))

    startInstance
      .createServerFn({ method: 'GET' })
      .inputValidator((input: { query: string }) => ({
        parsed: input.query,
      }))
      .handler((options) => {
        expectTypeOf(options.context).toEqualTypeOf<{
          locale: string
        }>()
        expectTypeOf(options.data).toEqualTypeOf<{
          parsed: string
        }>()
      })
  })
})

describe('startInstance.createMiddleware', () => {
  test('function middleware server callback sees request middleware context', () => {
    const startInstance = createStart(() => ({
      requestMiddleware: [localeMiddleware],
    }))

    startInstance
      .createMiddleware({ type: 'function' })
      .server(async (options) => {
        expectTypeOf(options.context).toEqualTypeOf<{
          locale: string
        }>()

        return options.next({ context: { extra: 'value' } })
      })
  })

  test('function middleware server callback sees both request and function middleware context', () => {
    const startInstance = createStart(() => ({
      requestMiddleware: [localeMiddleware],
      functionMiddleware: [authMiddleware],
    }))

    startInstance
      .createMiddleware({ type: 'function' })
      .server(async (options) => {
        expectTypeOf(options.context).toEqualTypeOf<{
          locale: string
          user: { id: string; role: string }
        }>()

        return options.next()
      })
  })

  test('request middleware server callback sees prior request middleware context', () => {
    const startInstance = createStart(() => ({
      requestMiddleware: [localeMiddleware],
    }))

    startInstance
      .createMiddleware({ type: 'request' })
      .server(async (options) => {
        expectTypeOf(options.context).toEqualTypeOf<{
          locale: string
        }>()

        return options.next({ context: { theme: 'dark' as string } })
      })
  })

  test('middleware context is undefined when no global middleware is configured', () => {
    const startInstance = createStart(() => ({}))

    startInstance
      .createMiddleware({ type: 'function' })
      .server(async (options) => {
        expectTypeOf(options.context).toEqualTypeOf<undefined>()

        return options.next()
      })
  })

  test('middleware created via startInstance can be used in startInstance.createServerFn', () => {
    const startInstance = createStart(() => ({
      requestMiddleware: [localeMiddleware],
    }))

    const extraMiddleware = startInstance
      .createMiddleware({ type: 'function' })
      .server(async (options) => {
        return options.next({
          context: { extra: 'value' as string },
        })
      })

    startInstance
      .createServerFn({ method: 'GET' })
      .middleware([extraMiddleware])
      .handler((options) => {
        expectTypeOf(options.context).toEqualTypeOf<{
          locale: string
          extra: string
        }>()
      })
  })

  test('middleware can chain other middleware before defining server', () => {
    const startInstance = createStart(() => ({
      requestMiddleware: [localeMiddleware],
    }))

    const innerMiddleware = createMiddleware({ type: 'function' }).server(
      ({ next }) => {
        return next({ context: { inner: true as boolean } })
      },
    )

    startInstance
      .createMiddleware({ type: 'function' })
      .middleware([innerMiddleware])
      .server(async (options) => {
        expectTypeOf(options.context).toEqualTypeOf<{
          locale: string
          inner: boolean
        }>()

        return options.next()
      })
  })
})
