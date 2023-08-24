import * as React from 'react'
import { Link, Outlet } from '@tanstack/react-router'
import { FileRoute } from '@tanstack/router-core'

export const route = new FileRoute('/_layout').createRoute({
  component: () => {
    return (
      <div>
        <div>I'm a layout</div>
        <div className="flex gap-2">
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
  },
})
