/**
 * An import another plugin's transform adds to a module, after Start's
 * compiler read it (an auto-import; R92, R102.2): import protection does not
 * judge the import, but a denied file it reaches is still its own violation.
 * The client gets the mock (`behavior: 'mock'`) and the build reports the
 * module the import was added to; with the `error` behaviour the build fails
 * there. Real Vite and Rsbuild builds; diagnostics by severity, file and
 * position only.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { rejection } from '../../importProtection/start-apps'
import { importersIn } from './v2-hosts'
import type { RsbuildPlugin } from '@rsbuild/core'
import type { Plugin } from 'vite'
import type { StartBuildOptions } from '../../build-harness'

const timeout = 60_000

const files = {
  'src/db.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
  // the plugin below prepends `import { secret } from './db.server'` (plain
  // JavaScript: a TypeScript transform after it would drop the import of a
  // name only a declaration types)
  'src/inj.js': `export const read = () => secret()\n`,
  'src/entry.ts': `export { read } from './inj'\n`,
}

const injected = `import { secret } from './db.server'\n`
const isInjected = (id: string) => /[\\/]src[\\/]inj\.js$/.test(id)

/** A later plugin adding an import to `src/inj.js`, as an auto-import plugin does. */
const vitePlugin: Plugin = {
  name: 'test:add-import',
  transform(code, id) {
    return isInjected(id) ? `${injected}${code}` : null
  },
}

const rsbuildPlugin: RsbuildPlugin = {
  name: 'test:add-import',
  setup(api) {
    api.transform({ test: /[\\/]src[\\/]inj\.js$/ }, ({ code }) => ({
      code: `${injected}${code}`,
    }))
  },
}

const withPlugin = (
  bundler: (typeof startBundlers)[number],
): Pick<StartBuildOptions, 'viteConfig' | 'rsbuildConfig'> =>
  bundler === 'vite'
    ? { viteConfig: { plugins: [vitePlugin] } }
    : { rsbuildConfig: { plugins: [rsbuildPlugin] } }

const readScript = `${describeValuePrelude}
try {
  return describeValue(entry.read(), 'MARK_')
} catch (error) {
  return 'throws: ' + String(error)
}`

describe.each(startBundlers)('%s build', (bundler) => {
  // the report's fix, applied: no plugin adds the import; the module imports
  // the file itself, inside createServerOnlyFn
  test(
    'the fixed app (the import written in the module, inside createServerOnlyFn) builds with the error behaviour, and the client has none of the file',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          ...files,
          'src/inj.js': `import { createServerOnlyFn } from '@tanstack/react-start'
import { secret } from './db.server'
export const read = createServerOnlyFn(() => secret())
`,
        },
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'error' } },
      })
      expect(build.client.where('MARK_SECRET')).toBe('nowhere')
    },
    timeout,
  )

  test(
    'mock: the client gets the mock, and the build reports the module the import was added to',
    async () => {
      const build = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
        start: { importProtection: { behavior: 'mock', mockAccess: 'off' } },
        ...withPlugin(bundler),
      })
      const { result } = await build.client.run(readScript)
      expect({
        read: result,
        reported: importersIn(build, 'client'),
      }).toEqual({ read: 'a safe mock', reported: ['src/inj.js'] })
    },
    timeout,
  )

  test(
    'error: the build fails at the module the import was added to',
    async () => {
      const error = await rejection(
        buildStart({
          bundler,
          files,
          entry: 'src/entry.ts',
          start: { importProtection: { behavior: 'error' } },
          ...withPlugin(bundler),
        }),
      )
      expect(importersIn(error, 'client')).toEqual(['src/inj.js'])
    },
    timeout,
  )
})
