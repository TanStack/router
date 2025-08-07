import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

import { createRouter } from '#tanstack-start-router-entry'

const fetch = createStartHandler({
  createRouter,
})(defaultStreamHandler)

export default {
  fetch,
}
