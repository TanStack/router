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
  // vite reloads the config file for the prerender preview server;
  // an earlier load in this process already started the server
  if (process.env.VITE_EXTERNAL_PORT) return

  const port = await getRandomPort()
  process.env.VITE_NODE_ENV = 'test'
  process.env.VITE_EXTERNAL_PORT = String(port)

  const server = await localDummyServer(port)
  server.unref()
  server.on('connection', (socket) => socket.unref())
}

export async function e2eStopDummyServer(input: string) {
  const port = await getDummyServerPort(input)

  await fetch(`http://localhost:${port}/stop`, {
    method: 'POST',
  })
}
