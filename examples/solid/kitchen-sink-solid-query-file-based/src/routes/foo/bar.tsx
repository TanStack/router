import { createFileRoute } from '@tanstack/solid-router'
import { z } from 'zod/v4'

export const Route = createFileRoute('/foo/bar')({
  component: () => <div>{JSON.stringify(Route.useSearch())}</div>,
  validateSearch: z.object({ asdf: z.string() }),
})
