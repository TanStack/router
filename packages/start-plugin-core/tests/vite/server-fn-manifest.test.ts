import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'
import { describe, expect, test } from 'vitest'
import { startCompilerPlugin } from '../../src/vite/start-compiler-plugin/plugin'
import { compileFor } from '../regression-helpers'
import type { PluginOption } from 'vite'

const runNode = promisify(execFile)
const testDir = path.dirname(fileURLToPath(import.meta.url))

const startRuntimeStubs: Record<string, string> = {
  '@tanstack/react-start': `const builder = () => ({
  handler: (rpc, impl) =>
    impl
      ? Object.assign((opts) => impl(opts ?? {}), {
          __executeServer: (opts) => impl(opts ?? {}),
        })
      : (opts) => rpc(opts ?? {}),
})
export const createServerFn = builder
`,
  '@tanstack/react-start/server-rpc': `export const createServerRpc = (meta, fn) => Object.assign(fn, { meta })
`,
  '@tanstack/react-start/ssr-rpc': `import { getServerFnById } from '#tanstack-start-server-fn-resolver'
export const createSsrRpc = (id) => async (opts) => {
  const serverFn = await getServerFnById(id, { origin: 'server' })
  return serverFn(opts)
}
`,
}

const stubFileName = (source: string) => `${source.replaceAll('/', '_')}.js`

function stubStartRuntime(root: string): PluginOption {
  return {
    name: 'test:start-runtime-stubs',
    enforce: 'pre',
    resolveId(source) {
      return source in startRuntimeStubs
        ? path.join(root, stubFileName(source))
        : undefined
    },
  }
}

async function buildAndRun(files: Record<string, string>, script: string) {
  const root = await mkdtemp(path.join(testDir, '.server-fn-manifest-'))
  try {
    const sources = {
      ...Object.fromEntries(
        Object.entries(startRuntimeStubs).map(([source, code]) => [
          stubFileName(source),
          code,
        ]),
      ),
      ...files,
    }
    for (const [file, code] of Object.entries(sources)) {
      await writeFile(path.join(root, file), code)
    }

    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        stubStartRuntime(root),
        startCompilerPlugin({
          framework: 'react',
          environments: [{ name: 'ssr', type: 'server' }],
          providerEnvName: 'ssr',
        }),
      ],
      build: {
        ssr: path.join(root, 'entry.ts'),
        outDir: 'dist',
        minify: false,
        rollupOptions: {
          output: { entryFileNames: 'entry.mjs', chunkFileNames: '[name].mjs' },
        },
      },
    })

    const entryUrl = pathToFileURL(path.join(root, 'dist/entry.mjs')).href
    const { stdout } = await runNode(process.execPath, [
      '--input-type=module',
      '--eval',
      `const entry = await import(${JSON.stringify(entryUrl)})
const result = await (async () => { ${script} })()
process.stdout.write(JSON.stringify(result))`,
    ])
    return JSON.parse(stdout) as unknown
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('server function resolver manifest', () => {
  test('resolves a server function only called by another server function', async () => {
    await expect(
      buildAndRun(
        {
          'entry.ts': `export { outer } from './outer'`,
          'outer.ts': `import { createServerFn } from '@tanstack/react-start'
import { innerOnlyCalledByServer } from './inner'
export const outer = createServerFn().handler(
  async () => \`outer:\${await innerOnlyCalledByServer()}\`,
)
`,
          'inner.ts': `import { createServerFn } from '@tanstack/react-start'
export const innerOnlyCalledByServer = createServerFn().handler(
  async () => 'inner',
)
`,
        },
        `return entry.outer()`,
      ),
    ).resolves.toBe('outer:inner')
  })

  test('resolves a chain of server functions only called by the server', async () => {
    await expect(
      buildAndRun(
        {
          'entry.ts': `export { outer } from './outer'`,
          'outer.ts': `import { createServerFn } from '@tanstack/react-start'
import { middle } from './middle'
export const outer = createServerFn().handler(
  async () => \`outer:\${await middle()}\`,
)
`,
          'middle.ts': `import { createServerFn } from '@tanstack/react-start'
import { readDeepest } from './helpers'
export const middle = createServerFn().handler(
  async () => \`middle:\${await readDeepest()}\`,
)
`,
          'helpers.ts': `import { deepest } from './deepest'
export const readDeepest = () => deepest()
`,
          'deepest.ts': `import { createServerFn } from '@tanstack/react-start'
export const deepest = createServerFn().handler(async () => 'deepest')
`,
        },
        `return entry.outer()`,
      ),
    ).resolves.toBe('outer:middle:deepest')
  })

  test('keeps resolving a server function the entry calls directly', async () => {
    await expect(
      buildAndRun(
        {
          'entry.ts': `export { direct } from './direct'`,
          'direct.ts': `import { createServerFn } from '@tanstack/react-start'
export const direct = createServerFn().handler(async () => 'direct')
`,
        },
        `return entry.direct()`,
      ),
    ).resolves.toBe('direct')
  })

  test('development resolves server function ids without a manifest', async () => {
    const { code } = await compileFor(
      'ssr',
      `import { createServerFn } from '@tanstack/react-start'
export const inner = createServerFn().handler(async () => 'inner')
`,
      { mode: 'dev' },
    )

    const id = code?.match(/createSsrRpc\(["'`]([^"'`]+)["'`]\)/)?.[1]
    expect(id).toBeDefined()
    expect(
      JSON.parse(Buffer.from(id!, 'base64url').toString('utf8')),
    ).toMatchObject({ export: 'inner_createServerFn_handler' })
  })
})
