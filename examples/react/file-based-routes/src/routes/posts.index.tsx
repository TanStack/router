import * as React from 'react'
import { FileRoute } from '@tanstack/react-router'

// @ts-ignore
export const route = new FileRoute('/posts/').createRoute({
  component: () => <div>Select a post.</div>,
})
