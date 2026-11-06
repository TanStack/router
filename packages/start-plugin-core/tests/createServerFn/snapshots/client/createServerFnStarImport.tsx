import { createClientRpc } from '@tanstack/react-start/client-rpc'
import * as TanStackStart from '@tanstack/react-start'
export const withUseServer = TanStackStart.createServerFn({
  method: 'GET',
}).handler(createClientRpc('80v0H7Z-40eAvJELD4yOZd'))
export const withoutUseServer = TanStackStart.createServerFn({
  method: 'GET',
}).handler(createClientRpc('XbUOHXbrBke2Xebq_cpd9s'))
export const withVariable = TanStackStart.createServerFn({
  method: 'GET',
}).handler(createClientRpc('id9L9xtkvHA0G7YPmv4k5B'))
export const withZodValidator = TanStackStart.createServerFn({
  method: 'GET',
}).handler(createClientRpc('Y0OXye37qmukl8eWdR6BXL'))
