import { createServerRpc } from '@tanstack/react-start/server-rpc'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
const withUseServer_createServerFn_handler = createServerRpc(
  {
    id: '80v0H7Z-40eAvJELD4yOZd',
    name: 'withUseServer',
    filename: 'src/test.ts',
  },
  (opts) => withUseServer.__executeServer(opts),
)
const withUseServer = createServerFn({ method: 'GET' })
  .validator(z.number())
  .handler(withUseServer_createServerFn_handler, ({ input }) => input + 1)
export { withUseServer_createServerFn_handler }
