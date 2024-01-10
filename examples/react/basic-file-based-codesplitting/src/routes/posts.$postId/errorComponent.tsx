import * as React from 'react'
import { ErrorComponent, ErrorRouteProps } from '@tanstack/react-router'
import { PostNotFoundError } from '../../posts'

export const errorComponent = function PostErrorComponent({
  error,
}: ErrorRouteProps) {
  if (error instanceof PostNotFoundError) {
    return <div>{error.message}</div>
  }

  return <ErrorComponent error={error} />
}
