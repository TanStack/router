import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$project/$version/docs/')({
  loader: () => {
    throw redirect({
      from: '/$project/$version/docs',
      to: '/$project/$version/docs/framework/$framework/$',
      params: {
        framework: 'react',
        _splat: 'overview',
      },
    })
  },
})
