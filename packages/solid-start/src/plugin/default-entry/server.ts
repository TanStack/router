import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/solid-start/server'

import { createRouter } from '#tanstack-start-router-entry'

const fetch = createStartHandler({
  createRouter,
})(defaultStreamHandler)

export default {
  fetch,
}
