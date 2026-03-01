// Analytics feature package.
// This simulates a separate package in a monorepo that uses
// startInstance.createServerFn and startInstance.createMiddleware
// to create server functions and middleware with fully-typed context
// flowing from the global request middleware — WITHOUT needing
// access to the app's routeTree.gen.ts or Register module augmentation.

import { startInstance } from '@repo/start-config'

// --- 1) Direct server function via startInstance.createServerFn ---
// context.locale and context.userId flow automatically from global request middleware
export const getAnalyticsContext = startInstance
  .createServerFn({ method: 'GET' })
  .handler(({ context }) => {
    return {
      locale: context.locale,
      userId: context.userId,
    }
  })

// --- 2) Middleware created via startInstance.createMiddleware ---
// The global request context (locale, userId) is visible in .server() callback
const analyticsMiddleware = startInstance
  .createMiddleware()
  .server(({ next, context }) => {
    const sessionId = `session-${context.userId}-${context.locale}` as string
    return next({
      context: {
        sessionId,
      },
    })
  })

// --- 3) Server function that uses local middleware (extends global context) ---
export const getAnalyticsSession = startInstance
  .createServerFn({ method: 'GET' })
  .middleware([analyticsMiddleware])
  .handler(({ context }) => {
    return {
      locale: context.locale,
      userId: context.userId,
      sessionId: context.sessionId,
    }
  })
