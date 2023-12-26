import { RouteApi } from '@tanstack/react-router'
import * as React from 'react'

const routeApi = new RouteApi({ id: '/expensive/' })

export default function Expensive() {
  const { emoji } = routeApi.useLoaderData()
  return (
    <div className={`p-2`}>
      I am an "expensive" component... which really just means that I was
      code-split {emoji}
    </div>
  )
}
