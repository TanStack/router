import { registerGlobalMiddleware } from '@tanstack/start'
import { logMiddleware } from './utils/loggingMiddleware'

registerGlobalMiddleware({
  middleware: [logMiddleware],
})
