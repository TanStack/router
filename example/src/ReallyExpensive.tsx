import * as React from 'react'
import { RouteImported, useRoute } from 'react-location'

import { sleepCache } from './App'

function Expensive() {
  const route = useRoute()
  return <>Really Expensive Data: {JSON.stringify(route.data)}</>
}

export const route: RouteImported = {
  element: <Expensive />,
  loader: async () => ({
    reallyExpensive: await sleepCache.read('/reallyExpensive', 1000, 1000 * 10),
  }),
}
