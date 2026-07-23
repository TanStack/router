import { fileURLToPath } from 'node:url'
import path from 'pathe'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const defaultEntryDir = path.resolve(
  currentDir,
  '..',
  '..',
  'plugin',
  'default-entry',
)

export const octaneStartDefaultEntryPaths = {
  client: path.resolve(defaultEntryDir, 'client.ts'),
  server: path.resolve(defaultEntryDir, 'server.ts'),
  start: path.resolve(defaultEntryDir, 'start.ts'),
}
