import { createServerFn } from '@tanstack/react-start'

// Deepest link of a cross-file, server-only chain. Only reachable through
// `chainLevelB`'s handler, so it is discovered only on the second pass of the
// provider-module fixpoint (after chainLevelB itself is registered).
export const chainLevelC = createServerFn().handler(() => {
  return { level: 'C', value: 'deepest-chain-value' }
})
