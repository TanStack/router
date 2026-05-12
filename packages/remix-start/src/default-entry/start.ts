import { createStart } from '@tanstack/remix-start'

/**
 * Default Start instance. Apps override by exporting `startInstance` from
 * their own `start.{ts,tsx}` in the configured src directory.
 */
export const startInstance = createStart(() => ({}))
