import { createCsrfMiddleware, createStart } from '@tanstack/react-start'
export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({
      filter: ({ handlerType }) => handlerType === 'serverFn',
    }),
  ],
}))
