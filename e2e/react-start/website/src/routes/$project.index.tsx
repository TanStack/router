import { redirect } from '@tanstack/react-router'

export const Route = createFileRoute({
  loader: ({ params }) => {
    throw redirect({
      to: '/$project/$version',
      params: {
        project: params.project,
        version: 'latest',
      },
    })
  },
})
