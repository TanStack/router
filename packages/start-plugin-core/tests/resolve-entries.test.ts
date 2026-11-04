import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalize } from 'pathe'
import { afterEach, expect, test } from 'vitest'
import { resolveStartEntryPlan } from '../src/planning'
import { parseStartConfig } from '../src/vite/schema'

const defaultEntryPaths = {
  client: '/virtual/default-client',
  server: '/virtual/default-server',
  start: '/virtual/default-start',
}
let root: string | undefined

afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a later entry plan in the same process sees an entry created after a miss', () => {
  root = mkdtempSync(join(tmpdir(), 'tanstack-start-entry-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'router.ts'), 'export {}\n')
  const startConfig = parseStartConfig({}, { framework: 'react' }, root)
  const plan = () =>
    resolveStartEntryPlan({ root: root!, startConfig, defaultEntryPaths })

  expect(plan().entryPaths.server).toBe(defaultEntryPaths.server)

  const serverEntry = join(root, 'src', 'server.ts')
  writeFileSync(serverEntry, 'export default {}\n')

  expect(plan().entryPaths.server).toBe(normalize(realpathSync(serverEntry)))
})
