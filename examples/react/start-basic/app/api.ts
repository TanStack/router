import { createApiHandler, handleApiFileRoute } from '@tanstack/start/server'
import { getRouterManifest } from '@tanstack/start/router-manifest'

const handler = createApiHandler(async ({ request }) => {
  const res = await handleApiFileRoute({ request, getRouterManifest })
  return res
})

export default handler
