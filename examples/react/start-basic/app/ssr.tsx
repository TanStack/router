import {
  createStartHandler,
  defaultStreamHandler,
  defineEventHandler,
} from '@tanstack/react-start/server'

import { createRouter } from './router'

export default defineEventHandler((event) => {
  const startHandler = createStartHandler({
    createRouter,
  })(defaultStreamHandler)

  return startHandler(event)
})
