import { createSsrRpc } from '@tanstack/react-start/ssr-rpc'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
export const withUseServer = createServerFn({ method: 'GET' })
  .validator(z.number())
  .handler(createSsrRpc('80v0H7Z-40eAvJELD4yOZd'))
