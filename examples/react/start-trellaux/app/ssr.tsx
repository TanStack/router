import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/start/server'
import { getRouterManifest } from '@tanstack/start/router-manifest'
import { createClerkHandler } from '@clerk/tanstack-start/server'

import { createRouter } from './router'

const handler = createStartHandler({
  createRouter,
  getRouterManifest,
})

const clerkHandler = createClerkHandler(handler)

/*
 * // You can also override Clerk options by passing an object as second argument
 * const clerkHandler = createClerkHandler(handler, {
 *   afterSignInUrl: '/dashboard',
 * });
 */

export default clerkHandler(defaultStreamHandler)
