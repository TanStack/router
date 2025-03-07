import {
  createStartHandler,
  defaultStreamHandler,
  defineEventHandler,
  getWebRequest,
} from '@tanstack/react-start/server'

import { createRouter } from './router'

export default defineEventHandler((event) => {
  console.log(getWebRequest(event)?.url)

  const startHandler = createStartHandler({
    createRouter,
  })(defaultStreamHandler)

  return startHandler(event)
})
