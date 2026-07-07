import { createServerFn } from '@tanstack/react-start'
import { sharedInnerServerFn } from './internal'

// Exported by a separate package and called from the consuming app. Its handler
// calls `sharedInnerServerFn`, which is only reachable through this handler and
// lives in the same (external) package.
export const sharedServerFn = createServerFn().handler(async () => {
  const inner = await sharedInnerServerFn()
  return { outer: 'from-shared-package-outer', inner }
})
