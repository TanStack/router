import { createLazyFileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createLazyFileRoute('/_layout-test/layout-b/test')({
  component: LayoutBComponent,
})

function LayoutBComponent() {
  return <div>I'm layout B test</div>
}
