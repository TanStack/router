import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const search = z.object({
  rootSearch: z.number(),
})

export const Route = createFileRoute('/(gen)/search')({
  component: () => <div>Hello /search!</div>,
  validateSearch: search,
})
