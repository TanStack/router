import { createSsrRpc } from '@tanstack/react-start/ssr-rpc'
import { createServerFn as serverFn } from '@tanstack/react-start'
export const withUseServer = serverFn({ method: 'GET' }).handler(
  createSsrRpc('80v0H7Z-40eAvJELD4yOZd'),
)
export const withoutUseServer = serverFn({ method: 'GET' }).handler(
  createSsrRpc('XbUOHXbrBke2Xebq_cpd9s'),
)
export const withVariable = serverFn({ method: 'GET' }).handler(
  createSsrRpc('id9L9xtkvHA0G7YPmv4k5B'),
)
export const withZodValidator = serverFn({ method: 'GET' }).handler(
  createSsrRpc('Y0OXye37qmukl8eWdR6BXL'),
)
