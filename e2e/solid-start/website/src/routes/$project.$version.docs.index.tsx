import { redirect } from '@tanstack/solid-router'

export const Route = createFileRoute({
  beforeLoad: () => {
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
