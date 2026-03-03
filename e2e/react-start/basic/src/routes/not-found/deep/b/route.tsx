import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/not-found/deep/b')({
  beforeLoad: ({ search }) => {
    if (search.throwAt === 'b') {
      throw notFound({
        data: { source: 'b-beforeLoad' },
      })
    }
  },
  component: () => <Outlet />,
  notFoundComponent: (props: any) => (
    <div data-testid="deep-b-notFound-component">
      Not Found at /not-found/deep/b ({props?.data?.source ?? 'unknown'})
    </div>
  ),
})
