import { createSsrRpc } from '@tanstack/react-start/ssr-rpc'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
export const withUseServer = createServerFn({ method: 'GET' }).handler(
  createSsrRpc('80v0H7Z-40eAvJELD4yOZd'),
)
export const withArrowFunction = createServerFn({ method: 'GET' }).handler(
  createSsrRpc('3CuVcIf56mXjOm391b0xfG'),
)
export const withArrowFunctionAndFunction = createServerFn({
  method: 'GET',
}).handler(createSsrRpc('7-JuMRVpFOk-B1xNtJ2lhL'))
export const withoutUseServer = createServerFn({ method: 'GET' }).handler(
  createSsrRpc('XbUOHXbrBke2Xebq_cpd9s'),
)
export const withVariable = createServerFn({ method: 'GET' }).handler(
  createSsrRpc('id9L9xtkvHA0G7YPmv4k5B'),
)
export const withZodValidator = createServerFn({ method: 'GET' }).handler(
  createSsrRpc('Y0OXye37qmukl8eWdR6BXL'),
)
export const withValidatorFn = createServerFn({ method: 'GET' })
  .validator(z.number())
  .handler(createSsrRpc('lJiDYujGD-4bdw-88mWATZ'))
