import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
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

function createRoot({ router = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tanstack-start-entry-'))
  roots.add(root)
  mkdirSync(join(root, 'src'))
  if (router) {
    writeFileSync(join(root, 'src', 'router.ts'), 'export {}\n')
  }
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

describe('entry planning for a project under a test runner', () => {
  // A package that only uses Start's compile-time APIs has no router.
  test('plans a project without a router entry', () => {
    const root = createRoot({ router: false })
    const startConfig = parseViteStartConfig({}, corePluginOpts, root)

    const plan = resolveStartEntryPlan({
      root,
      startConfig,
      defaultEntryPaths,
      routerEntryOptional: true,
    })

    expect(plan.routerFilePath).toBe('')
    expect(plan.entryPaths).toEqual({ ...defaultEntryPaths, router: '' })
  })

  // A typo in the config is not a project without a router.
  test('fails for a configured router entry that does not exist', () => {
    const root = createRoot()
    const startConfig = parseViteStartConfig(
      { router: { entry: './missing-router.ts' } },
      corePluginOpts,
      root,
    )

    expect(() =>
      resolveStartEntryPlan({
        root,
        startConfig,
        defaultEntryPaths,
        routerEntryOptional: true,
      }),
    ).toThrow('missing-router.ts')
  })
})
