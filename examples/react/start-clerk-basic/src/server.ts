import {
  createStartHandler,
  defaultStreamHandler,
  defineHandlerCallback,
} from '@tanstack/react-start/server'
import { createClerkHandler } from '@clerk/tanstack-react-start/server'
import { createRouter } from './router'

const handlerFactory = createClerkHandler(
  createStartHandler({
    createRouter,
  }),
)

export default defineHandlerCallback(async (event) => {
  const startHandler = await handlerFactory(defaultStreamHandler)
  return startHandler(event)
})
