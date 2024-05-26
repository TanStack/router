import {
  createRequestHandler,
  defaultStreamHandler,
} from '@tanstack/start/server'

import { createRouter } from './router'

export default createRequestHandler({
  router: createRouter(),
})(defaultStreamHandler)
