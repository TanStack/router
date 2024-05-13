import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/search')({
  component: () => <div>Hello /search!</div>,
})
