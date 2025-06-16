import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createClerkHandler } from '@clerk/tanstack-react-start/server'
import { createRouter } from './router'

const handler = createStartHandler({
  createRouter,
})

// @ts-expect-error
const clerkHandler = createClerkHandler(handler)

export default clerkHandler(defaultStreamHandler)
