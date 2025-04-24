import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/solid-start/server'
import { getRouterManifest } from '@tanstack/solid-start/router-manifest'

import { createRouter } from './router'

export default createStartHandler({
  createRouter,
  getRouterManifest,
})(defaultStreamHandler)
