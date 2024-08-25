import {
  createStartAPIHandler,
  defaultAPIFileRouteHandler,
} from '@tanstack/start/api'
import { getRouterManifest } from '@tanstack/start/router-manifest'

export default createStartAPIHandler(({ request }) =>
  defaultAPIFileRouteHandler({ request, getRouterManifest }),
)
