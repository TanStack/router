import { createClientRpc } from '@tanstack/react-start/client-rpc'
import { createServerFn } from '@tanstack/react-start'
export const withUseServer = createServerFn({ method: 'GET' }).handler(
  createClientRpc('80v0H7Z-40eAvJELD4yOZd'),
)
export const withArrowFunction = createServerFn({ method: 'GET' }).handler(
  createClientRpc('3CuVcIf56mXjOm391b0xfG'),
)
export const withArrowFunctionAndFunction = createServerFn({
  method: 'GET',
}).handler(createClientRpc('7-JuMRVpFOk-B1xNtJ2lhL'))
export const withoutUseServer = createServerFn({ method: 'GET' }).handler(
  createClientRpc('XbUOHXbrBke2Xebq_cpd9s'),
)
export const withVariable = createServerFn({ method: 'GET' }).handler(
  createClientRpc('id9L9xtkvHA0G7YPmv4k5B'),
)
export const withZodValidator = createServerFn({ method: 'GET' }).handler(
  createClientRpc('Y0OXye37qmukl8eWdR6BXL'),
)
export const withValidatorFn = createServerFn({ method: 'GET' }).handler(
  createClientRpc('lJiDYujGD-4bdw-88mWATZ'),
)
