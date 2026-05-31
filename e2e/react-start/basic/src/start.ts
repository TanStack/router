import { createMiddleware, createStart } from '@tanstack/react-start'

const globalMiddleware = createMiddleware().server(({ next, context }) => {
  //                                                         ^?
  // `context` is typed from the `server.requestContext` registered in `server.ts`
  // via `declare module '@tanstack/react-start'`, so `context.globalFoo` is `string`.
  console.debug('Global middleware context:', context) // should log the context
  console.debug('Global middleware context.globalFoo:', context.globalFoo) // should log '123'
  return next()
})

export const startInstance = createStart(() => ({
  requestMiddleware: [globalMiddleware],
}))
