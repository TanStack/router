import * as React from 'react'
import { Link, Outlet, RoutePropsFromRoute } from '@tanstack/router'
import { rootRoute } from '../main'

export default function (props: RoutePropsFromRoute<typeof rootRoute>) {
  const loader = props.useLoader()

  return (
    <>
      <div>
        <Link to="/">Home</Link> <Link to="/about">About</Link>
      </div>
      <hr />
      <Outlet />
    </>
  )
}
