import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/nested-docs/$project/$version/')({
  loader: ({ params }) => {
    throw redirect({
      from: '/nested-docs/$project/$version',
      to: '/nested-docs/$project/$version/docs/framework/$framework',
      params: {
        project: params.project,
        version: params.version,
        framework: 'react',
      },
    })
  },
  component: () => <div>Hello /nested-docs/$project/$version/!</div>,
})
