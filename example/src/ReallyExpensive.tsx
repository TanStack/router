import * as React from 'react'
import { Link, Outlet, RouteImported, useRoute } from 'react-location'

import { sleepCache } from './App'

function Expensive() {
  const route = useRoute()
  return (
    <>
      Really Expensive Data: {JSON.stringify(route.data)}
      <br />
      <Link to="sub-expensive">
        <pre>sub-expensive</pre>
      </Link>
      <hr />
      <Outlet />
    </>
  )
}

function SubExpensive() {
  const route = useRoute()
  return <>Sub-Expensive Data: {JSON.stringify(route.data)}</>
}

export const route: RouteImported = {
  element: <Expensive />,
  loader: async () => ({
    reallyExpensive: await sleepCache.read('/reallyExpensive', 1000, 1000 * 10),
  }),
  children: [
    {
      path: 'sub-expensive',
      element: <SubExpensive />,
      loader: async () => ({
        subExpensive: await sleepCache.read('/subExpensive', 1000, 1000 * 10),
      }),
    },
  ],
}
