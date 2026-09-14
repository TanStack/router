import handler from '@tanstack/react-start/server-entry'
import { install as installTemporalPolyfill } from 'temporal-polyfill/shim'

installTemporalPolyfill()

export default {
  fetch(request: Request) {
    return handler.fetch(request)
  },
}
