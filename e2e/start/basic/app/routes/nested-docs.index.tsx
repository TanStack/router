import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/nested-docs/')({
  loader: () => {
    throw redirect({
      to: '/nested-docs/$project/$version/docs/framework/$framework',
      params: { project: 'router', version: 'latest', framework: 'react' },
    })
  },
  component: () => <div>Hello /nested-docs/!</div>,
})
