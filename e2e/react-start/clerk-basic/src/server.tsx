import {
  createStartHandler,
  defaultStreamHandler,
  defineEventHandler,
} from '@tanstack/react-start/server'
import { createClerkHandler } from '@clerk/tanstack-start/server'
import { createRouter } from './router'

export default defineEventHandler((event) => {
  const startHandler = createStartHandler({
    createRouter,
  })

  const withClerkHandler =
    createClerkHandler(startHandler)(defaultStreamHandler)

  return withClerkHandler(event)
})
