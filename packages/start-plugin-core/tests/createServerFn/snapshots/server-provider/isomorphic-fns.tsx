import { createServerRpc } from '@tanstack/react-start/server-rpc'
import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
const getEnv = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
const getServerEnv_createServerFn_handler = createServerRpc(
  {
    id: 'Jc6GTcykFaVJAwm-a0BofP',
    name: 'getServerEnv',
    filename: 'src/test.ts',
  },
  (opts) => getServerEnv.__executeServer(opts),
)
const getServerEnv = createServerFn().handler(
  getServerEnv_createServerFn_handler,
  () => getEnv(),
)
const getEcho = createIsomorphicFn()
  .server((input: string) => 'server received ' + input)
  .client((input) => 'client received ' + input)
const getServerEcho_createServerFn_handler = createServerRpc(
  {
    id: 's0jNQTWKXVmb2EhbCIBxAU',
    name: 'getServerEcho',
    filename: 'src/test.ts',
  },
  (opts) => getServerEcho.__executeServer(opts),
)
const getServerEcho = createServerFn()
  .validator((input: string) => input)
  .handler(getServerEcho_createServerFn_handler, ({ data }) => getEcho(data))
export {
  getServerEnv_createServerFn_handler,
  getServerEcho_createServerFn_handler,
}
