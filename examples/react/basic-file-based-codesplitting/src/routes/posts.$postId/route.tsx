import { FileRoute } from '@tanstack/react-router'

export const Route = new FileRoute('/posts/$postId').createRoute({
  loaderDeps: () => ({
    test: 'tanner' as const,
  }),
})
