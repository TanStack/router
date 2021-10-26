import * as React from 'react'
import { router } from '.'

export default function Expensive() {
  const route = router.useRoute()

  return <>Expensive Data: {JSON.stringify(route.data)}</>
}
