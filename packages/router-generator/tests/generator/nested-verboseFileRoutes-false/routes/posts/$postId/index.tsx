export const Route = createFileRoute({
  validateSearch: () => ({
    indexSearch: 'search',
  }),
  component: () => <div>Hello /posts/$postId/!</div>,
})
