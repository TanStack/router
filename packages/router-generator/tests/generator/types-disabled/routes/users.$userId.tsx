import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createFileRoute('/users/$userId')({
  component: () => <div>Hello /users/$userId!</div>,
})
