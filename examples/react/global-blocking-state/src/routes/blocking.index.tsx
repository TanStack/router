import * as React from 'react'
import { createFileRoute, useBlocker } from '@tanstack/react-router'

export const Route = createFileRoute('/blocking/')({
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  useBlocker({
    shouldBlockFn: async () => Promise.resolve(true),
    enableBeforeUnload: true,
    disabled: false,
    withResolver: true,
  })

  return <div>This page always blocks navigation</div>
}
