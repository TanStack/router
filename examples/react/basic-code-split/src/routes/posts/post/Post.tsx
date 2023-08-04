import * as React from 'react'
import { ComponentFromRoute } from '@tanstack/router'
import { postRoute } from './postRoute'

export const Posts: ComponentFromRoute<typeof postRoute> = ({ useLoader }) => {
  const { data: post } = useLoader()()

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
    </div>
  )
}
