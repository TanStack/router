/**
 * An annotation written after a statement, for the call next to it on the same
 * line (`const list = []; /* @__PURE__ *\/ mk()`), stays with that call when the
 * statement moves to a chunk, in real production builds: the bundler drops the
 * annotated call, and whatever follows the statement in its chunk, which the
 * annotation does not apply to, still runs. What a bundler drops is its own
 * decision, as in code-splitter-dead-code.test.ts; a page reads the effects.
 * SPEC G2, G12.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, onTestFinished, test } from 'vitest'
import { viteVersions } from '@tanstack/compiler-vite-versions'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { tanstackRouter } from '../../src/vite'
import { build, buildWithRsbuild, head, routeApp } from '../build-harness'

const timeout = 60_000

const route = (
  annotation: string,
) => `${head}function mk() { (globalThis as any).annotated = 'MARK_ANNOTATED' }
const list: Array<string> = []; ${annotation} mk()
list.push('MARK_PUSHED')
const Comp = () => <p>{list.join()}</p>
export const Route = createFileRoute('/')({ component: Comp })
`

describe.each(['vite', 'rspack', 'webpack'] as const)('%s', (bundler) => {
  test.for(['/* @__PURE__ */', '/* #__PURE__ */'])(
    'after a statement that moves, %s annotates the call on its line and nothing else',
    { timeout },
    async (annotation) => {
      const app = await build({
        bundler,
        env: 'client',
        files: routeApp(route(annotation), { env: 'client' }),
      })
      const run =
        await app.run(`await entry.mount(entry.Route.options.component)
return globalThis.annotated ?? null`)
      expect(run.html).toContain('MARK_PUSHED')
      expect(run.result).toBeNull()
      expect(app.where('MARK_ANNOTATED')).toBe('nowhere')
    },
  )
})

// The annotation is the last thing on its line, for the call on the next one
// (`const list = []; /* @__PURE__ *\/` then `mk()`), with a line comment or a
// multi-line comment between them: the same, on the five builds (Vite 7 and
// Rsbuild render in Node; Rsbuild builds the client).
const lineEnd = (
  annotation: string,
  between: string,
) => `${head}function mk() { (globalThis as any).annotated = 'MARK_ANNOTATED' }
const list: Array<string> = []; ${annotation}${between}mk()
list.push('MARK_PUSHED')
const Comp = () => <p>{list.join()}</p>
export const Route = createFileRoute('/')({ component: Comp })
`

const render = `const html = await entry.render(entry.Route.options.component)
return { html, annotated: globalThis.annotated ?? null }`

async function vite7(files: Record<string, string>) {
  const vite = await viteVersions.find((v) => v.major === 7)!.load()
  const app = await createApp({
    dir: path.dirname(fileURLToPath(import.meta.url)),
    prefix: '.annotations-vite7-',
    files,
    packageJson: { type: 'module' },
    registerCleanup: onTestFinished,
  })
  const outDir = path.join(app.root, 'dist')
  await vite.build({
    root: app.root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: path.join(app.root, 'routes'),
        generatedRouteTree: path.join(app.root, 'routeTree.gen.ts'),
        codeSplittingOptions: { addHmr: false },
      }),
    ],
    esbuild: { jsx: 'automatic' },
    build: {
      ssr: 'entry.ts',
      outDir,
      rollupOptions: { output: { entryFileNames: 'entry.js' } },
    },
  })
  const { stdout } = await runNodeProgram(
    `const entry = await import(${JSON.stringify(path.join(outDir, 'entry.js'))})
console.log(JSON.stringify(await (async () => { ${render} })()))`,
    { cwd: app.root },
  )
  return JSON.parse(stdout.trim().split('\n').at(-1)!) as {
    html: string
    annotated: string | null
  }
}

const runners: Record<
  string,
  (route: string) => Promise<{ html: string; annotated: unknown }>
> = {
  ...Object.fromEntries(
    (['vite', 'rspack', 'webpack'] as const).map((bundler) => [
      bundler,
      async (route: string) => {
        const app = await build({
          bundler,
          env: 'client',
          files: routeApp(route, { env: 'client' }),
        })
        const run =
          await app.run(`await entry.mount(entry.Route.options.component)
return globalThis.annotated ?? null`)
        return { html: run.html ?? '', annotated: run.result }
      },
    ]),
  ),
  'vite 7': (route) => vite7(routeApp(route)),
  rsbuild: async (route) => {
    const app = await buildWithRsbuild({ files: routeApp(route) })
    return (await app.run(render)).result as {
      html: string
      annotated: unknown
    }
  },
}

describe.each(Object.keys(runners))('%s', (name) => {
  test.for([
    ['/* @__PURE__ */', '\n'],
    ['/* #__PURE__ */', '\n'],
    ['/* @__PURE__ */', ' // about mk\n'],
    ['/* @__PURE__ */', ' /* about\n mk */ '],
    ['// @__PURE__', '\n'],
  ])(
    'after a statement that moves, %j ending its line annotates the call on the next one and nothing else',
    { timeout },
    async ([annotation, between]) => {
      const { html, annotated } = await runners[name]!(
        lineEnd(annotation!, between!),
      )
      expect(html).toContain('MARK_PUSHED')
      // whether a bundler honours a line-comment annotation is its own
      // decision (Rspack's minifier does not)
      if (annotation!.startsWith('/*')) {
        expect(annotated).toBeNull()
      }
    },
  )
})
