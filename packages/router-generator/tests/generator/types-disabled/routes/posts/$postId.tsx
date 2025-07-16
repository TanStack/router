import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createFileRoute('/posts/$postId')({
  component: () => <div>Hello /posts/$postId!</div>,
})
