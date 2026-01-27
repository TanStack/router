import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/other')({
  head: () => ({
    meta: [{ title: 'Other Page' }],
    scripts: [
      {
        children: `window.__OTHER_PAGE_LOADED__ = Date.now();`,
      },
    ],
  }),
  component: OtherComponent,
})

function OtherComponent() {
  return (
    <div>
      <h2 data-testid="other-heading">Other Page</h2>
      <p>This page has its own scripts.</p>
    </div>
  )
}
