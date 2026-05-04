import { fileURLToPath } from 'node:url'
import path from 'pathe'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const defaultEntryDir = path.resolve(
  currentDir,
  '..',
  'default-entry',
)

/**
 * Default entry paths used by `tanStackStartVite` when the app doesn't
 * provide its own `client.tsx` / `server.ts` / `start.ts` under the
 * configured `srcDirectory`. The bundled defaults are minimal Remix UI
 * adapters that hydrate the router on the client and stream the SSR'd
 * document on the server — same shape as solid-start's defaults.
 */
export const remixStartDefaultEntryPaths = {
  client: path.resolve(defaultEntryDir, 'client.tsx'),
  server: path.resolve(defaultEntryDir, 'server.ts'),
  start: path.resolve(defaultEntryDir, 'start.ts'),
}
