import * as React from 'react'
import { useRoute } from 'react-location'

import { sleepCache } from '.'

export const route = {
  element: <Expensive />,
  load: async () => ({
    expensive: await sleepCache.read('/expensive', 1000, 1000 * 10),
  }),
}

function Expensive() {
  const route = useRoute()
  return <>Expensive Data: {JSON.stringify(route.data)}</>
}
