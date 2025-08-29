import { createMiddleware } from '@tanstack/react-start'
import { createFooServerFn } from './createFooServerFn'

const barMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => {
    console.log('Bar middleware triggered')
    return next({
      context: { bar: 'bar' } as const,
    })
  },
)

export const createBarServerFn = createFooServerFn().middleware([barMiddleware])

export const barFnInsideFactoryFile = createBarServerFn().handler(
  ({ context }) => {
    return {
      name: 'barFnInsideFactoryFile',
      context,
    }
  },
)
