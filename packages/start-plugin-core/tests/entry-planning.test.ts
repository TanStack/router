import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalize } from 'pathe'
import { afterEach, describe, expect, test } from 'vitest'
import { resolveStartEntryPlan } from '../src/planning'
import { parseStartConfig as parseRsbuildStartConfig } from '../src/rsbuild/schema'
import { parseStartConfig as parseViteStartConfig } from '../src/vite/schema'

const corePluginOpts = { framework: 'react' as const }
const defaultEntryPaths = {
  client: '/virtual/default-client',
  server: '/virtual/default-server',
  start: '/virtual/default-start',
}
const roots = new Set<string>()

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), 'tanstack-start-entry-'))
  roots.add(root)
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'router.ts'), 'export {}\n')
  return root
}

afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true })
  }
  roots.clear()
})

describe('server entry planning', () => {
  test.each([
    ['vite', parseViteStartConfig],
    ['rsbuild', parseRsbuildStartConfig],
  ])(
    'uses the default server entry for %s when none is configured',
    (_, parse) => {
      const root = createRoot()
      const startConfig = parse({}, corePluginOpts, root)

      const plan = resolveStartEntryPlan({
        root,
        startConfig,
        defaultEntryPaths,
      })

      expect(plan.entryPaths.server).toBe(defaultEntryPaths.server)
    },
  )

  test.each([
    ['vite', parseViteStartConfig],
    ['rsbuild', parseRsbuildStartConfig],
  ])('resolves a custom server entry for %s from srcDirectory', (_, parse) => {
    const root = createRoot()
    const serverEntry = join(root, 'src', 'server-entry.ts')
    writeFileSync(serverEntry, 'export default {}\n')
    const startConfig = parse(
      {
        server: {
          entry: './server-entry.ts',
        },
      },
      corePluginOpts,
      root,
    )

    const plan = resolveStartEntryPlan({
      root,
      startConfig,
      defaultEntryPaths,
    })

    expect(plan.entryPaths.server).toBe(normalize(realpathSync(serverEntry)))
  })

  test.each([
    ['vite', parseViteStartConfig],
    ['rsbuild', parseRsbuildStartConfig],
  ])(
    'resolves a custom server entry for %s from a custom srcDirectory',
    (_, parse) => {
      const root = createRoot()
      mkdirSync(join(root, 'app'))
      writeFileSync(join(root, 'app', 'router.ts'), 'export {}\n')
      const serverEntry = join(root, 'app', 'server-entry.ts')
      writeFileSync(serverEntry, 'export default {}\n')
      const startConfig = parse(
        {
          srcDirectory: 'app',
          server: {
            entry: './server-entry.ts',
          },
        },
        corePluginOpts,
        root,
      )

      const plan = resolveStartEntryPlan({
        root,
        startConfig,
        defaultEntryPaths,
      })

      expect(plan.entryPaths.server).toBe(normalize(realpathSync(serverEntry)))
    },
  )
})

describe('entry resolution', () => {
  test('probes the extensions in order and skips directories', () => {
    const root = createRoot()
    writeFileSync(join(root, 'src', 'client.tsx'), 'export {}\n')
    writeFileSync(join(root, 'src', 'client.jsx'), 'export {}\n')
    mkdirSync(join(root, 'src', 'start'))
    writeFileSync(join(root, 'src', 'start', 'index.ts'), 'export {}\n')
    const startConfig = parseViteStartConfig({}, corePluginOpts, root)

    const plan = resolveStartEntryPlan({ root, startConfig, defaultEntryPaths })

    expect(plan.routerFilePath).toBe(
      normalize(realpathSync(join(root, 'src', 'router.ts'))),
    )
    expect(plan.entryPaths.client).toBe(
      normalize(realpathSync(join(root, 'src', 'client.tsx'))),
    )
    expect(plan.entryPaths.start).toBe(defaultEntryPaths.start)
  })

  test('resolves a configured entry through a symlink to its real path', () => {
    const root = createRoot()
    mkdirSync(join(root, 'entries'))
    const target = join(root, 'entries', 'server.ts')
    writeFileSync(target, 'export default {}\n')
    symlinkSync(target, join(root, 'src', 'linked-server.ts'))
    const startConfig = parseViteStartConfig(
      { server: { entry: 'linked-server' } },
      corePluginOpts,
      root,
    )

    const plan = resolveStartEntryPlan({ root, startConfig, defaultEntryPaths })

    expect(plan.entryPaths.server).toBe(normalize(realpathSync(target)))
  })

  test('sees an entry created after an earlier resolution missed it', () => {
    const root = createRoot()
    const startConfig = parseViteStartConfig({}, corePluginOpts, root)
    expect(
      resolveStartEntryPlan({ root, startConfig, defaultEntryPaths }).entryPaths
        .server,
    ).toBe(defaultEntryPaths.server)

    const serverEntry = join(root, 'src', 'server.ts')
    writeFileSync(serverEntry, 'export default {}\n')

    expect(
      resolveStartEntryPlan({ root, startConfig, defaultEntryPaths }).entryPaths
        .server,
    ).toBe(normalize(realpathSync(serverEntry)))
  })

  test('throws when the router entry is missing', () => {
    const root = createRoot()
    rmSync(join(root, 'src', 'router.ts'))
    const startConfig = parseViteStartConfig({}, corePluginOpts, root)

    expect(() =>
      resolveStartEntryPlan({ root, startConfig, defaultEntryPaths }),
    ).toThrow('Could not resolve entry for router entry: router in')
  })
})
