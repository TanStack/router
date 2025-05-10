import { redirect } from '@tanstack/react-router'

export const Route = createFileRoute({
  beforeLoad: () => {
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
