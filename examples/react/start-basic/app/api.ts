import { createApiHandler, handleApiFileRoute } from '@tanstack/start/server'
import { getRouterManifest } from '@tanstack/start/router-manifest'

export default createApiHandler(({ request }) =>
  handleApiFileRoute({ request, getRouterManifest }),
)
