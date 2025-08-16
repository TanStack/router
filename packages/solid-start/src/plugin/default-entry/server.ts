import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/solid-start/server'

import { createStart } from '#tanstack-start-createStart-entry'

const fetch = createStartHandler({
  createStart,
})(defaultStreamHandler)

export default {
  fetch,
}
