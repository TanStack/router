import { Link, Outlet, RouteImported, useMatch } from 'react-location'

import { simpleCache, sleep } from './'

function ReallyExpensive() {
  const route = useMatch()
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
  const route = useMatch()
  return <>Sub-Expensive Data: {JSON.stringify(route.data)}</>
}

export const route: RouteImported = {
  element: <ReallyExpensive />,
  loader: simpleCache.createLoader(
    async () => {
      return {
        reallyExpensive: Math.random(),
      }
    },
    { maxAge: 1000 * 10 }
  ),
  children: [
    {
      path: 'sub-expensive',
      element: <SubExpensive />,
      loader: simpleCache.createLoader(
        async () => {
          await sleep(1000)
          return {
            subExpensive: Math.random(),
          }
        },
        { maxAge: 1000 * 10 }
      ),
    },
  ],
}
