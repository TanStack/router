import * as React from 'react'
import {
  ErrorComponent,
  ErrorRouteProps,
  FileRoute,
} from '@tanstack/react-router'
import { PostNotFoundError } from '../../posts'

export const Route = new FileRoute('/posts/$postId').createRoute({
  errorComponent: PostErrorComponent,
  loaderDeps: () => ({
    test: 'tanner' as const,
  }),
})

export function PostErrorComponent({ error }: ErrorRouteProps) {
  if (error instanceof PostNotFoundError) {
    return <div>{error.message}</div>
  }

  return <ErrorComponent error={error} />
}
