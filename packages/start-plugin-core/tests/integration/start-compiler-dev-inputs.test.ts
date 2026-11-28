/**
 * What a Vite dev server tells the Start compiler besides a save of a
 * module: another plugin's virtual module read by every environment, a
 * tsconfig edit, and file events of a server without HMR (Vitest's).
 */
import { writeFile } from 'node:fs/promises'
import tsconfigPaths from 'vite-tsconfig-paths'
import { describe, expect, test } from 'vitest'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { callServerFn, startDevServer, startRequestFiles } from '../dev-server'

const timeout = 30_000

const factory = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
const plain = `export const base = { handler: (fn: () => unknown) => fn }\n`

describe('Vite dev: a Start factory exported by a virtual module', () => {
  // Source: review round 3 (R3-G4-2): only the client environment could
  // load another plugin's virtual module, so the SSR environment compiled
  // its importer as if the factory were unknown code.
  test(
    'SSR: a server fn built on it, compiled first by the SSR environment, runs by id',
    async () => {
      const resolvedId = '\0virtual:kit'
      const server = await startDevServer({
        start: {},
        plugins: [
          {
            name: 'kit',
            resolveId: (source) =>
              source === 'virtual:kit' ? resolvedId : undefined,
            load: (id) =>
              id === resolvedId
                ? `import { createServerFn } from '@tanstack/react-start'
export const authed = createServerFn()
`
                : undefined,
          },
        ],
        files: {
          ...startRequestFiles,
          'src/fns.ts': `import { authed } from 'virtual:kit'
export const getSecret = authed.handler(() => 'MARK_KIT')
`,
        },
      })
      const { getSecret } = await server.import('/src/fns.ts')
      expect(await callServerFn(server, getSecret)).toBe('MARK_KIT')
    },
    timeout,
  )
})

describe('Vite dev: a tsconfig edit', () => {
  // Source: review round 3 (R3-G3-1): Vite transforms every module again
  // after a tsconfig edit, and the compiler answered from plans whose
  // resolutions it did not ask again.
  test(
    'SSR: a server fn built on a factory imported through a path the edit adds runs by id',
    async () => {
      const tsconfig = (paths: Record<string, Array<string>>) =>
        `${JSON.stringify({ compilerOptions: { paths } }, null, 2)}\n`
      const server = await startDevServer({
        start: {},
        plugins: [tsconfigPaths()],
        files: {
          ...startRequestFiles,
          'tsconfig.json': tsconfig({}),
          'src/lib/base.ts': factory,
          'src/fns.ts': `import { base } from '@lib/base'
export const getLib = base.handler(() => 'MARK_LIB')
`,
        },
      })
      await expect(server.import('/src/fns.ts')).rejects.toThrow()
      await server.edit({
        'tsconfig.json': tsconfig({ '@lib/*': ['./src/lib/*'] }),
      })
      const { getLib } = await server.import('/src/fns.ts')
      expect(await callServerFn(server, getLib)).toBe('MARK_LIB')
    },
    timeout,
  )
})

describe('Vite dev without HMR', () => {
  // Source: review round 3 (R3-G4-4): Vite runs no `hotUpdate` hook with
  // `server.hmr: false` (Vitest's dev server), which was the compiler's only
  // invalidation of a dev server.
  test(
    'client: a module importing a factory that stops being one keeps its handler',
    async () => {
      const server = await startDevServer({
        config: { server: { hmr: false, watch: {} } },
        files: {
          'src/b.ts': factory,
          'src/a.ts': `import { base } from './b'
export const run = base.handler(() => 'MARK_HANDLER')
`,
        },
      })
      const served = () => server.transform('/src/a.ts')
      expect(await served()).not.toContain('MARK_HANDLER')
      await writeFile(server.file('src/b.ts'), plain)
      await waitForOutcome({
        timeout: 10_000,
        applied: async () => (await served()).includes('MARK_HANDLER'),
        describe: served,
      })
    },
    timeout,
  )
})
