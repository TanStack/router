import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/redirect/$target/via-loader')({
  loaderDeps: ({ search: { reloadDocument } }) => ({ reloadDocument }),
  loader: ({ params: { target }, deps: { reloadDocument } }) => {
    switch (target) {
      case 'internal':
        throw redirect({ to: '/posts', reloadDocument })
      case 'external':
        throw redirect({ href: 'http://example.com' })
    }
  },
  component: () => <div>{Route.fullPath}</div>,
})
