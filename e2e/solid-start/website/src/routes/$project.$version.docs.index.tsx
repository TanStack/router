import { redirect } from '@tanstack/solid-router'

export const Route = createFileRoute({
  loader: () => {
    throw redirect({
      from: '/$project/$version/docs',
      to: '/$project/$version/docs/framework/$framework/$',
      params: {
        framework: 'solid',
        _splat: 'overview',
      },
    })
  },
})
