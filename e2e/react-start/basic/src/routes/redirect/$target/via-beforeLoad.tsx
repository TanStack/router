import { redirect } from '@tanstack/react-router'

export const Route = createFileRoute({
  beforeLoad: ({
    params: { target },
    search: { reloadDocument, externalHost },
  }) => {
    switch (target) {
      case 'internal':
        throw redirect({ to: '/posts', reloadDocument })
      case 'external':
        throw redirect({ href: externalHost })
    }
  },
  component: () => <div>{Route.fullPath}</div>,
})
