import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { readSecret } from './server-only'

export const secretMiddleware = createMiddleware({ type: 'function' })
  .client(({ next }) => next({ headers: { 'x-greeting': 'from the client' } }))
  .server(({ next }) => next({ context: { secret: readSecret() } }))

export const greet = createServerFn({ method: 'POST' })
  .middleware([secretMiddleware])
  .validator((name: string) => {
    if (!name) {
      throw new Error('A name is required')
    }
    return name
  })
  // (typed as a string: a mock returns the type of the handler, and the type
  // of this template would be `Hello ${string}, ${string}`)
  .handler(({ data, context }): string => `Hello ${data}, ${context.secret}`)

// Stands for a route loader or a component in the file that defines the
// server function it calls.
export function welcome(name: string) {
  return greet({ data: name })
}
