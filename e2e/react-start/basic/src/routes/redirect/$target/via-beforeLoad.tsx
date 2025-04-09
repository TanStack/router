import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/redirect/$target/via-beforeLoad')({
  beforeLoad: ({
    params: { target },
    search: { reloadDocument, externalHost },
  }) => {
    switch (target) {
      case 'internal':
        throw redirect({ to: '/posts', reloadDocument })
      case 'external':
        const href = externalHost ?? 'http://example.com'
        throw redirect({ href })
    }
  },
  component: () => <div>{Route.fullPath}</div>,
})
