import { clerkMiddleware } from 'clerk-solidjs-tanstack-start/server'
import { createStart } from '@tanstack/solid-start'

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [clerkMiddleware()],
  }
})
