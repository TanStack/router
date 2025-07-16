import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createFileRoute('/posts')({
  component: () => <div>Hello /posts!</div>,
})
