import { createApiHandler, handleApiFileRoute } from '@tanstack/start/server'
import { getRouterManifest } from '@tanstack/start/router-manifest'

export const handler = createApiHandler(async (request) => {
  const res = await handleApiFileRoute({ request, getRouterManifest })
  return res
})
