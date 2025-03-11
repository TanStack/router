import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/params')({
  component: () => <div>Hello /params!</div>,
})
