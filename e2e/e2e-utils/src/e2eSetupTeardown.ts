import { getRandomPort } from 'get-port-please'
import { localDummyServer } from './localDummyServer'
import { getDummyServerPort } from './derivePort'

export async function e2eStartDummyServer(input: string) {
  const port = await getDummyServerPort(input)

  return await localDummyServer(port)
}

/**
 * Prerendering happens inside `vite build`, where no dummy server is running,
 * so pages whose loaders fetch the "external host" would hit the real one —
 * unstable in CI. Call this from an app's vite config when building in
 * prerender mode: it starts the dummy server on a free port for the lifetime
 * of the build and exposes it via VITE_NODE_ENV/VITE_EXTERNAL_PORT for
 * request-time lookups. Everything is unref'd so the build process can exit.
 */
export async function e2eStartDummyServerForBuild() {
  // vite reloads the config file for the prerender preview server; the first
  // load in this process already started the server. Guard on our own flag —
  // NOT on VITE_EXTERNAL_PORT, which could be pre-set in the environment and
  // must not stop us from starting the server and setting VITE_NODE_ENV.
  const globalState = globalThis as typeof globalThis & {
    __tanstackRouterE2eBuildDummyServer?: { port: number }
  }

  if (!globalState.__tanstackRouterE2eBuildDummyServer) {
    const port = await getRandomPort()
    const server = await localDummyServer(port)
    server.unref()
    server.on('connection', (socket) => socket.unref())
    globalState.__tanstackRouterE2eBuildDummyServer = { port }
  }

  process.env.VITE_NODE_ENV = 'test'
  process.env.VITE_EXTERNAL_PORT = String(
    globalState.__tanstackRouterE2eBuildDummyServer.port,
  )
}

export async function e2eStopDummyServer(input: string) {
  const port = await getDummyServerPort(input)

  await fetch(`http://localhost:${port}/stop`, {
    method: 'POST',
  })
}
