import { Link, Outlet, useMatch } from 'react-location'

import { LocationGenerics, simpleCache, sleep } from './'

export const reallyExpensiveLoaders = {
  element: <ReallyExpensive />,
  loader: simpleCache.createLoader<LocationGenerics>(
    async () => {
      return {
        reallyExpensive: Math.random(),
      }
    },
    { maxAge: 1000 * 10 }
  ),
}

export const subExpensiveLoaders = {
  element: <SubExpensive />,
  loader: simpleCache.createLoader<LocationGenerics>(
    async () => {
      await sleep(1000)
      return {
        subExpensive: Math.random(),
      }
    },
    { maxAge: 1000 * 10 }
  ),
}

export function ReallyExpensive() {
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

export function SubExpensive() {
  const route = useMatch()
  return <>Sub-Expensive Data: {JSON.stringify(route.data)}</>
}
