import * as React from 'react'
import { RouteApi } from '@tanstack/react-router'

const api = new RouteApi({ id: '/hello' })

export const component = function Hello() {
  const data = api.useLoaderData()

  return <div className="p-2">{data}</div>
}
