import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/nested-docs/$project/')({
  loader: ({ params }) => {
    throw redirect({
      to: '/nested-docs/$project/$version/docs/framework/$framework',
      params: {
        project: params.project,
        version: 'latest',
        framework: 'react',
      },
    })
  },
  component: () => <div>Hello /nested-docs/$project/!</div>,
})
