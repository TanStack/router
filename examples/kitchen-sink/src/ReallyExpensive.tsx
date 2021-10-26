import { RouteImported } from 'react-location'

import { simpleCache, sleep, router } from './'

function ReallyExpensive() {
  const route = router.useRoute()
  return (
    <>
      Really Expensive Data: {JSON.stringify(route.data)}
      <br />
      <router.Link to="sub-expensive">
        <pre>sub-expensive</pre>
      </router.Link>
      <hr />
      <router.Outlet />
    </>
  )
}

function SubExpensive() {
  const route = router.useRoute()
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
