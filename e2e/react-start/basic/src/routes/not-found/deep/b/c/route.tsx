import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/not-found/deep/b/c')({
  beforeLoad: ({ search }) => {
    if (search.throwAt === 'c') {
      throw notFound({
        data: { source: 'c-beforeLoad' },
      })
    }
  },
  component: () => <Outlet />,
  notFoundComponent: (props: any) => (
    <div data-testid="deep-c-notFound-component">
      Not Found at /not-found/deep/b/c ({props?.data?.source ?? 'unknown'})
    </div>
  ),
})
