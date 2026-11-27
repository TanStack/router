import { createFileRoute } from '@tanstack/react-router'
// @ts-nocheck
// @ts-expect-error - we deliberately testing route that should not be created
export const Route = createFileRoute('/imIgnored')()

// (not a route file: nothing may execute it, the route tree included)
throw new Error('imIgnored.route.tsx is not a route file: never executed')
