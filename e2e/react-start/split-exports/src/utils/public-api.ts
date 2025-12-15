/**
 * This module re-exports from shared.ts
 * Tests that the split-exports plugin handles re-exports correctly.
 */

// Re-export isomorphic functions (createIsomorphicFn based)
export {
  getEnvironment,
  formatMessage,
  formatUserName,
  APP_NAME,
} from './shared'

// Re-export server functions (createServerFn based - also isomorphic)
export { getServerEnvironment, getUserById, getAllUsers } from './shared'

// Also re-export with rename
export { getEnvironment as getEnv } from './shared'

// Note: We intentionally do NOT re-export the server-only exports:
// - getServerOnlyUserData
// - getServerOnlyDatabase
// - serverOnlyConfig
// This simulates a "public API" module that only exposes safe exports.
