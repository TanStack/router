import * as React from 'react'
import { createFileRoute, useBlocker } from '@tanstack/react-router'

export const Route = createFileRoute('/global-blocker/_layout/multi-blockers')({
  component: MultiBlockersPage,
})

function MultiBlockersPage() {
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
      <h1>This page always blocks navigation</h1>
      <div data-testid="blocker-1-status">blocker1 is {blocker1.status}</div>
      <div data-testid="blocker-2-status">blocker2 is {blocker2.status}</div>
    </div>
  )
}
