import { createMiddleware, createStart } from '@tanstack/react-start'

export const mwA = createMiddleware().server(async ({ next }) => {
  return next({
    context: {
      a: 'a-from-mwA',
      shared: 'shared-from-mwA',
    },
  })
})

export const mwB = createMiddleware().server(async ({ next }) => {
  return next({
    context: {
      b: 'b-from-mwB',
      shared: 'shared-from-mwB',
    },
  })
})

export const mwC = createMiddleware().server(async ({ next }) => {
  return next({
    context: {
      c: 'c-from-mwC',
    },
  })
})

export const startInstance = createStart(() => ({
  requestMiddleware: [mwA, mwB, mwC],
}))
