import {
  createStartHandler,
  defaultStreamHandler,
  defineEventHandler,
} from '@tanstack/start/server'
import { getRouterManifest } from '@tanstack/start/router-manifest'

import { createRouter } from './router'

export default defineEventHandler((event) => {
  const startHandler = createStartHandler({
    createRouter,
    getRouterManifest,
  })(defaultStreamHandler)

  return startHandler(event)
})
