import { createFileRoute } from '@tanstack/react-router'
import { make } from '../middleware'

// Layout-level middleware: runs for every route under /api/admin.
export const Route = createFileRoute('/api/admin')({
  server: {
    middleware: [make('a', 1)],
  },
})
