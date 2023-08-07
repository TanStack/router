import * as React from 'react'
import { ComponentFromRoute, useRouteContext } from '@tanstack/router'
import { postRoute } from './postRoute'
import { useLoaderInstance } from '@tanstack/react-loaders'

export const Posts: ComponentFromRoute<typeof postRoute> = ({
  useRouteContext,
}) => {
  const { loaderOptions } = useRouteContext()
  const { data: post } = useLoaderInstance(loaderOptions)

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}
