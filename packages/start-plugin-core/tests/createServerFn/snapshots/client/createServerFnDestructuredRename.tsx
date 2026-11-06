import { createClientRpc } from '@tanstack/react-start/client-rpc'
import { createServerFn as serverFn } from '@tanstack/react-start'
export const withUseServer = serverFn({ method: 'GET' }).handler(
  createClientRpc('80v0H7Z-40eAvJELD4yOZd'),
)
export const withoutUseServer = serverFn({ method: 'GET' }).handler(
  createClientRpc('XbUOHXbrBke2Xebq_cpd9s'),
)
export const withVariable = serverFn({ method: 'GET' }).handler(
  createClientRpc('id9L9xtkvHA0G7YPmv4k5B'),
)
export const withZodValidator = serverFn({ method: 'GET' }).handler(
  createClientRpc('Y0OXye37qmukl8eWdR6BXL'),
)
