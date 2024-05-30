import {
  createRequestHandler,
  defaultStreamHandler,
} from '@tanstack/start/server'
import { getRouterManifest } from '@tanstack/start/router-manifest'

import { createRouter } from './router'

export default createRequestHandler({
  createRouter,
  getRouterManifest,
})(defaultStreamHandler)
