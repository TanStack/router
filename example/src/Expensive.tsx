import * as React from 'react'
import { useRoute } from 'react-location'

export default function Expensive() {
  const route = useRoute()

  return <>Expensive Data: {JSON.stringify(route.data)}</>
}
