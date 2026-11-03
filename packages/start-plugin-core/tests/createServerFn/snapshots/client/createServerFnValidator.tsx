import { createClientRpc } from '@tanstack/react-start/client-rpc'
import { createServerFn } from '@tanstack/react-start'
export const withUseServer = createServerFn({ method: 'GET' }).handler(
  createClientRpc('80v0H7Z-40eAvJELD4yOZd'),
)
