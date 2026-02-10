import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/federated-data')({
  server: {
    handlers: {
      GET: async () => {
        const { getFederatedServerData } = await import('mf_remote/server-data')
        return Response.json(getFederatedServerData('server-route'))
      },
    },
  },
})
