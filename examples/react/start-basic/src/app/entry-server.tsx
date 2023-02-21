import { createRequestHandler } from '@tanstack/react-start/server'
import { createRouter } from './router'

export const requestHandler = createRequestHandler({
  createRouter,
})
