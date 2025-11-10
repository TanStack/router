import { clerkMiddleware } from '@clerk/tanstack-solid-start/server'
import { createStart } from '@tanstack/solid-start'
import type { AnyRequestMiddleware } from '@tanstack/solid-start'

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [clerkMiddleware() as AnyRequestMiddleware],
  }
})
