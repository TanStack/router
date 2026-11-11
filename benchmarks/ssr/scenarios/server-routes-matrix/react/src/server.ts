import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

export default { fetch: createStartHandler(defaultStreamHandler) }
