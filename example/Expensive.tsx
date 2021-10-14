import * as React from 'react'
import { Route, RouteImported, useRoute } from 'react-location'

import { sleepCache } from '.'

export const route: RouteImported = {
  element: <Expensive />,
  loader: async () => ({
    expensive: await sleepCache.read('/expensive', 1000, 1000 * 10),
  }),
}

function Expensive() {
  const route = useRoute()
  return <>Expensive Data: {JSON.stringify(route.data)}</>
}
