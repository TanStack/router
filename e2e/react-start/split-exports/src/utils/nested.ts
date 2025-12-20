/**
 * This module tests nested imports scenario.
 * It imports from shared.ts and uses both isomorphic and server-only code internally,
 * but only exposes isomorphic functions and server functions defined in THIS module.
 */

import { createServerFn, createIsomorphicFn } from '@tanstack/react-start'
import { getServerOnlyUserData, formatUserName, APP_NAME } from './shared'

// ============================================================
// INTERNAL SERVER-ONLY USAGE
// ============================================================

/**
 * This server function uses the server-only getServerOnlyUserData internally.
 * The client can call this server function, but the server-only code
 * only runs on the server.
 */
export const fetchUserProfile = createServerFn()
  .inputValidator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    // This uses the server-only function internally
    const userData = getServerOnlyUserData(userId)

    // Transform and return safe data
    return {
      id: userData.id,
      displayName: userData.name,
      contact: userData.email,
      appName: APP_NAME,
    }
  })

// ============================================================
// ISOMORPHIC EXPORTS
// ============================================================

/**
 * Isomorphic function that computes on both sides.
 */
export const computeGreeting = createIsomorphicFn()
  .server((name: string) => `Hello from the server, ${name}!`)
  .client((name: string) => `Hello from the client, ${name}!`)

/**
 * Server function to get greeting from server.
 */
export const getServerGreeting = createServerFn()
  .inputValidator((name: string) => name)
  .handler(async ({ data: name }) => {
    return computeGreeting(name)
  })

/**
 * Re-export the pure function for use in components.
 */
export { formatUserName }

/**
 * A computed constant.
 */
export const GREETING_PREFIX = 'Welcome to ' + APP_NAME
