import * as React from 'react'
import { Link, Outlet, createLazyFileRoute } from '@tanstack/react-router'
import { LinkWrapper, LinkWrapperWithFrom } from '../linkWrapper'

export const Route = createLazyFileRoute('/_layout-test')({
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div>
      <div>I'm a layout</div>
      <div className="flex gap-2">
        <LinkWrapper to="." search={(prev) => ({ ...prev, test: 'test' })} className="text-red-500">Doesn't Work</LinkWrapper>
        <LinkWrapperWithFrom to="." from={undefined} search={(prev) => ({ ...prev, test: 'test' })} className="text-green-500">Works</LinkWrapperWithFrom>
        <Link
          to="/layout-a"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Layout A
        </Link>
        <Link
          to="/layout-b"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Layout B
        </Link>
      </div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}
