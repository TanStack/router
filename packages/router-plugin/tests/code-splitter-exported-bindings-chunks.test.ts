import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { buildAndRun, head } from './regression-helpers'

// The generated route tree imports only `Route` from a route file, and it is in
// the entry chunk. This entry does the same, so nothing else uses the route
// file's other exports (tests that import them are not part of the build).
const entry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route } from './routes/index'
export { Route }
export const entryUrl = import.meta.url
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

const appPackage = JSON.stringify({
  name: 'app',
  private: true,
  type: 'module',
})

/**
 * Where each marker is built: in the entry chunk or a chunk it statically
 * imports, so that it loads with the entry ('entry'), or only in lazily loaded
 * chunks ('lazy').
 */
const placement = `const fs = await import('node:fs')
const path = await import('node:path')
const url = await import('node:url')
const dir = path.dirname(url.fileURLToPath(entry.entryUrl))
const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8')
const eager = new Set()
const visit = (file) => {
  if (eager.has(file)) return
  eager.add(file)
  for (const [, specifier] of read(file).matchAll(/(?:\\bfrom\\s*|\\bimport\\s*)["']\\.\\/([^"']+)["']/g)) visit(specifier)
}
visit('entry.mjs')
const where = (marker) => [
  ...new Set(
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.mjs') && read(file).includes(marker))
      .map((file) => (eager.has(file) ? 'entry' : 'lazy')),
  ),
]
return {
  html: await entry.render(entry.Route.options.component),
  declaration: where('MARK_DECLARATION'),
  dependency: where('MARK_DEPENDENCY'),
}`

describe('a split option leaves the exports of its route file it uses out of the entry chunk', () => {
  // Route files export page components and helpers so that tests can import
  // them, and only the split component uses them in the app.
  it.each([
    {
      name: 'an exported function component',
      code: `export function Card() {
  return <b>{heavy('MARK_DECLARATION')}</b>
}
function Page() {
  return <Card />
}`,
    },
    {
      name: 'a function component exported by specifier',
      code: `function Card() {
  return <b>{heavy('MARK_DECLARATION')}</b>
}
export { Card }
function Page() {
  return <Card />
}`,
    },
    {
      name: 'a default-exported function component',
      code: `export default function Card() {
  return <b>{heavy('MARK_DECLARATION')}</b>
}
function Page() {
  return <Card />
}`,
    },
    {
      // A client build bundles `react/jsx-runtime`, a CommonJS module, whose
      // interop call has side effects too
      name: 'an exported function component with a dependency that has side effects',
      code: `import { label } from '../label'
export function Card() {
  return <b>{heavy('MARK_DECLARATION ' + label)}</b>
}
function Page() {
  return <Card />
}`,
      // Only the declaration is asserted: how the bundler groups the modules
      // next to a dependency with side effects is up to it
      dependencyIn: expect.anything(),
    },
    {
      name: 'an exported helper function',
      code: `export function format(value: number) {
  return heavy('MARK_DECLARATION ' + value)
}
function Page() {
  return <p>{format(1)}</p>
}`,
    },
    {
      name: 'an exported class',
      code: `export class Store {
  value = heavy('MARK_DECLARATION')
}
function Page() {
  return <p>{new Store().value}</p>
}`,
    },
    {
      name: 'an exported function over module state',
      code: `let count = 0
export function next() {
  count++
  return heavy('MARK_DECLARATION ' + count)
}
function Page() {
  return <p>{next()}</p>
}`,
    },
  ])(
    '$name',
    async ({ code, dependencyIn = ['lazy'] }) => {
      const result = await buildAndRun(
        `${head}import { heavy } from '../heavy'
${code}
export const Route = createFileRoute('/')({ component: Page })
`,
        placement,
        {
          files: {
            'entry.ts': entry,
            // Without it the app inherits the package's `sideEffects: false`
            'package.json': appPackage,
            'heavy.ts': `export function heavy(label: string) {
  return label + ' MARK_DEPENDENCY'
}
`,
            'label.ts': `;(globalThis as any).labelLoaded = true\nexport const label = 'label'\n`,
          },
        },
      )
      expect(result).toEqual({
        html: expect.stringContaining('MARK_DECLARATION'),
        declaration: ['lazy'],
        dependency: dependencyIn,
      })
    },
    30_000,
  )
})

type Watcher = Extract<Awaited<ReturnType<typeof build>>, { close: unknown }>
interface WatcherEvent {
  code: string
  result?: { close: () => Promise<void> } | null
  error?: unknown
}

describe('a watch build', () => {
  // Bug in rolldown (https://github.com/rolldown/rolldown/issues/11223): a
  // module keeps the side-effect free flag of an earlier build when its
  // transforms stop returning one. After an edit gives the shared module a
  // top-level effect, the effect must still load with the entry.
  it('loads the effect an edit adds to the shared module with the entry', async () => {
    const { tanstackRouter } = await import('../src/vite')
    const root = await mkdtemp(path.join(__dirname, '.regression-build-'))
    const route = (registry: string) => `${head}${registry}
export function Card() {
  return <b>{registry.size}</b>
}
export const Route = createFileRoute('/')({ component: () => <Card /> })
`
    const pure = route('const registry = new Map()')
    const impure = route(`function createRegistry() {
  ;(globalThis as any).effects = ['MARK_EFFECT']
  return new Map()
}
const registry = createRegistry()`)
    const files: Record<string, string> = {
      'routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
      'routes/index.tsx': pure,
      'entry.ts': entry,
      'package.json': appPackage,
    }
    await mkdir(path.join(root, 'routes'))
    for (const [file, code] of Object.entries(files)) {
      await writeFile(path.join(root, file), code)
    }
    const watcher = (await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          autoCodeSplitting: true,
          codeSplittingOptions: { addHmr: false },
        }),
      ],
      build: {
        ssr: path.join(root, 'entry.ts'),
        outDir: 'dist',
        minify: false,
        watch: {},
        rollupOptions: {
          output: { entryFileNames: 'entry.mjs', chunkFileNames: '[name].mjs' },
        },
      },
    })) as Watcher
    const built = () =>
      new Promise<void>((resolve, reject) => {
        const onEvent = (event: WatcherEvent) => {
          if (event.code === 'BUNDLE_END') {
            void event.result?.close()
          } else if (event.code === 'END' || event.code === 'ERROR') {
            watcher.off('event', onEvent)
            if (event.code === 'ERROR') {
              reject(event.error)
            } else {
              resolve()
            }
          }
        }
        watcher.on('event', onEvent)
      })
    // Each run imports a fresh copy of the built entry
    const effectsAtStartup = async () => {
      const entryUrl = pathToFileURL(path.join(root, 'dist/entry.mjs')).href
      const { stdout } = await promisify(execFile)(process.execPath, [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(entryUrl)})
process.stdout.write(JSON.stringify(globalThis.effects ?? []))`,
      ])
      return JSON.parse(stdout) as Array<string>
    }
    try {
      await built()
      expect(await effectsAtStartup()).toEqual([])
      const rebuilt = built()
      await writeFile(path.join(root, 'routes/index.tsx'), impure)
      await rebuilt
      expect(await effectsAtStartup()).toEqual(['MARK_EFFECT'])
    } finally {
      await watcher.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
