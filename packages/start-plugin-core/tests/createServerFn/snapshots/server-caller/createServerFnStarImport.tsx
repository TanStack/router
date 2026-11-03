import { createSsrRpc } from '@tanstack/react-start/ssr-rpc'
import * as TanStackStart from '@tanstack/react-start'
export const withUseServer = TanStackStart.createServerFn({
  method: 'GET',
}).handler(createSsrRpc('80v0H7Z-40eAvJELD4yOZd'))
export const withoutUseServer = TanStackStart.createServerFn({
  method: 'GET',
}).handler(createSsrRpc('XbUOHXbrBke2Xebq_cpd9s'))
export const withVariable = TanStackStart.createServerFn({
  method: 'GET',
}).handler(createSsrRpc('id9L9xtkvHA0G7YPmv4k5B'))
export const withZodValidator = TanStackStart.createServerFn({
  method: 'GET',
}).handler(createSsrRpc('Y0OXye37qmukl8eWdR6BXL'))
