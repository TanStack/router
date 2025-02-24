import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { LinkWrapper } from '../../linkWrapper'

export const Route = createFileRoute('/_layout-test/layout-a')({
  component: LayoutAComponent,
})

function LayoutAComponent() {
  return (
    <div>
      I'm A!
      {/* <div>
        <LinkWrapper to="." search={(prev) => ({ ...prev, test: 'test' })} className="text-green-500">Wrapper Test (Works as Expected)</LinkWrapper>
      </div> */}
    </div>
  )
}
