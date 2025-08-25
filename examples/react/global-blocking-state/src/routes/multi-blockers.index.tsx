import * as React from 'react'
import { createFileRoute, useBlocker } from '@tanstack/react-router'

export const Route = createFileRoute('/multi-blockers/')({
  component: MultiBlockers,
})

function MultiBlockers() {
  const blocker1 = useBlocker({
    shouldBlockFn: async () => Promise.resolve(true),
    enableBeforeUnload: true,
    disabled: false,
    withResolver: true,
  })

  const blocker2 = useBlocker({
    shouldBlockFn: async () => Promise.resolve(true),
    enableBeforeUnload: true,
    disabled: false,
    withResolver: true,
  })

  return (
    <div>
      This page always blocks navigation
      <div>blocker1 is {blocker1.status}</div>
      <div>blocker2 is {blocker2.status}</div>
    </div>
  )
}
