/**
 * This module exports BOTH server-only code AND isomorphic code.
 * The split-exports plugin should allow client code to import only
 * the isomorphic exports without bundling the server-only code.
 *
 * Key test scenario:
 * - createServerFn exports are ISOMORPHIC (compiler transforms to fetch on client)
 * - createIsomorphicFn exports are ISOMORPHIC (explicit client/server implementations)
 * - Plain functions using server-only APIs are SERVER-ONLY (should be eliminated)
 */

import { createServerFn, createIsomorphicFn } from '@tanstack/react-start'

// ============================================================
// SERVER-ONLY CODE - This should NOT be bundled into the client
// ============================================================

/**
 * Simulates a database connection that only exists on the server.
 * If this code runs on the client, it would throw an error.
 */
export function getServerOnlyDatabase() {
  // This would typically be something like:
  // import { db } from './db' // which uses node:fs or similar
  if (typeof window !== 'undefined') {
    throw new Error('Database code should not run on the client!')
  }
  return {
    users: {
      findById: (id: string) => ({
        id,
        name: `User ${id}`,
        email: `user${id}@example.com`,
        // Secret field that should never be on the client
        passwordHash: 'secret-hash-should-not-leak',
      }),
      findAll: () => [
        { id: '1', name: 'Alice', email: 'alice@example.com' },
        { id: '2', name: 'Bob', email: 'bob@example.com' },
      ],
    },
  }
}

/**
 * Server-only function that directly uses the database.
 * This export should be eliminated from client bundles when not imported.
 */
export function getServerOnlyUserData(userId: string) {
  const db = getServerOnlyDatabase()
  return db.users.findById(userId)
}

/**
 * Another server-only export that would break if bundled to client.
 */
export const serverOnlyConfig = {
  databaseUrl: 'postgresql://localhost:5432/mydb',
  secretKey: 'super-secret-key-should-not-leak',
  getDatabase: getServerOnlyDatabase,
}

// ============================================================
// ISOMORPHIC CODE - Server Functions (createServerFn)
// These are safe to import on client - compiler transforms them
// ============================================================

/**
 * Server function to get the current environment.
 * Always returns 'server' because the handler runs on the server.
 * The client gets a fetch call instead.
 */
export const getServerEnvironment = createServerFn().handler(() => {
  return 'server'
})

/**
 * Server function to get a user by ID.
 * Uses the server-only database internally - but that's fine because
 * the handler only runs on the server.
 */
export const getUserById = createServerFn()
  .inputValidator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const userData = getServerOnlyUserData(userId)
    // Return safe data (no password hash)
    return {
      id: userData.id,
      name: userData.name,
      email: userData.email,
    }
  })

/**
 * Server function to get all users.
 */
export const getAllUsers = createServerFn().handler(async () => {
  const db = getServerOnlyDatabase()
  return db.users.findAll()
})

// ============================================================
// ISOMORPHIC CODE - createIsomorphicFn
// These have explicit client/server implementations
// ============================================================

/**
 * Isomorphic function that has different implementations on client/server.
 * This is safe to import on the client.
 */
export const getEnvironment = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')

/**
 * Isomorphic function with parameters.
 */
export const formatMessage = createIsomorphicFn()
  .server((message: string) => `[SERVER] ${message}`)
  .client((message: string) => `[CLIENT] ${message}`)

// ============================================================
// ISOMORPHIC CODE - Pure utilities
// These work everywhere without transformation
// ============================================================

/**
 * Pure isomorphic utility that doesn't need server/client split.
 * Just a helper function that works everywhere.
 */
export function formatUserName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim()
}

/**
 * A constant that's safe on both sides.
 */
export const APP_NAME = 'Split Exports Test App'
