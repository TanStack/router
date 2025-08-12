import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/solid-start/server'

import { createRouter } from './router'

const fetch = createStartHandler({
  createRouter,
})(defaultStreamHandler)

export default {
  fetch,
}
