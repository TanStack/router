import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/redirect/$target/via-beforeLoad')({
  beforeLoad: ({ params: { target } }) => {
    if (target === 'internal') {
      throw redirect({ to: '/posts' })
    }
    throw redirect({
      href: 'http://example.com',
    })
  },
  component: () => <div>{Route.fullPath}</div>,
})
