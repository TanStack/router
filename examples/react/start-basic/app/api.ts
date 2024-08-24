import { createAPIHandler, handleAPIFileRoute } from '@tanstack/start/server'
import { getRouterManifest } from '@tanstack/start/router-manifest'

export default createAPIHandler(({ request }) =>
  handleAPIFileRoute({ request, getRouterManifest }),
)
