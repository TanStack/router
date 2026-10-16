/**
 * Control tests of the Rsbuild dev-server harness (rsbuild-dev-server.ts):
 * `edit()` waits for the rebuild of the edited modules, and `outputs()`
 * returns what the environment emits afterwards.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { createRsbuildDevServer } from '../src/rsbuild-dev-server'

const testsDir = path.dirname(fileURLToPath(import.meta.url))

test('rebuilds the edited module and emits the edit', async () => {
  const server = await createRsbuildDevServer({
    dir: testsDir,
    files: {
      'src/entry.ts': `import { leaf } from './leaf'\nconsole.log(leaf)\n`,
      'src/leaf.ts': `export const leaf = 'MARK_V1'\n`,
    },
  })
  const joined = async () => Object.values(await server.outputs()).join('\n')
  expect(await joined()).toContain('MARK_V1')

  await server.edit({ 'src/leaf.ts': `export const leaf = 'MARK_V2'\n` })

  expect(server.rebuilt).toContain('src/leaf.ts')
  expect(await joined()).toContain('MARK_V2')
  expect(await joined()).not.toContain('MARK_V1')
}, 30_000)
