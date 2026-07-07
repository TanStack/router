import { createServerFn } from '@tanstack/react-start'

// A server-only function defined inside a shared package. It is reached only
// through the handler of the package's exported `sharedServerFn` (below), so it
// lives outside the consuming app's root AND behind a handler boundary — the
// case that the location-agnostic provider-module discovery exists to cover.
export const sharedInnerServerFn = createServerFn().handler(() => {
  return { secret: 'from-shared-package-inner' }
})
