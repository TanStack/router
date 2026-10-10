import { createFileRoute } from '@tanstack/solid-router'
import * as z from 'zod'

export const Route = createFileRoute('/foo/bar')({
  component: () => <div>{JSON.stringify(Route.useSearch())}</div>,
  validateSearch: z.object({ asdf: z.string() }),
})
