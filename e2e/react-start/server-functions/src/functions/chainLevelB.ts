import { createServerFn } from '@tanstack/react-start'
import { chainLevelC } from './chainLevelC'

// Middle link of the chain. Reached only through `chainLevelA`'s handler, and
// calls `chainLevelC` from its own handler.
export const chainLevelB = createServerFn().handler(async () => {
  const c = await chainLevelC()
  return { level: 'B', c }
})
