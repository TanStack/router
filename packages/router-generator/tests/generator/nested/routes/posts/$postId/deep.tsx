export const Route = createFileRoute({
  context: () => ({ someContext: 'context' }),
  loaderDeps: () => ({ dep: 1 }),
  loader: () => ({ data: 'data' }),
  component: () => <div>Hello /posts/$postId/deep!</div>,
})
