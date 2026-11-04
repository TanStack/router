/**
 * Exported bindings that reference each other (`class Z { o() { return A } }`
 * next to `class A extends Z`) share one extracted module: in two modules
 * importing each other, the one evaluated first depends on who imports what and
 * on how the bundler orders them, and `extends` can then find its base
 * uninitialised. Real builds on every bundler, run.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { viteVersions } from '@tanstack/compiler-vite-versions'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { onTestFinished } from '@tanstack/compiler-test-utils/test-scope'
import { tanstackRouter } from '../../src/vite'
import { build, buildWithRsbuild, head, rootRoute } from '../build-harness'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 60_000

const shapes = {
  'a base reading its subclass': {
    source: `export class Z { o() { return A } }
export class A extends Z { static m = 'MARK_CYCLE_END' }
`,
    base: 'Z',
    sub: 'A',
    names: ['Z', 'A'],
  },
  'the mirror': {
    source: `export class A { o() { return Z } }
export class Z extends A { static m = 'MARK_CYCLE_END' }
`,
    base: 'A',
    sub: 'Z',
    names: ['A', 'Z'],
  },
  renamed: {
    source: `class Z { o() { return A } }
class A extends Z { static m = 'MARK_CYCLE_END' }
export { Z as P, A as Q }
`,
    base: 'Z',
    sub: 'A',
    names: ['P', 'Q'],
  },
  'the mirror, renamed': {
    source: `class A { o() { return B } }
class B extends A { static m = 'MARK_CYCLE_END' }
export { A as Q, B as P }
`,
    base: 'A',
    sub: 'B',
    names: ['Q', 'P'],
  },
  'through a helper': {
    source: `function helper() { return A }
export class Z { o() { return helper() } }
export class A extends Z { static m = 'MARK_CYCLE_END' }
`,
    base: 'Z',
    sub: 'A',
    names: ['Z', 'A'],
  },
  'through a third export': {
    source: `export class Z { o() { return via() } }
export function via() { return A }
export class A extends Z { static m = 'MARK_CYCLE_END' }
`,
    base: 'Z',
    sub: 'A',
    names: ['Z', 'A'],
  },
  'one of them read by the route module at load': {
    source: `export class Z { o() { return A } }
export class A extends Z { static m = 'MARK_CYCLE_END' }
;(globalThis as any).keptAtLoad = A
`,
    base: 'Z',
    sub: 'A',
    names: ['Z', 'A'],
    eager: true,
  },
} as const

type Shape = (typeof shapes)[keyof typeof shapes]

const route = ({ source, base, sub }: Shape) =>
  `${head}${source}export const Route = createFileRoute('/')({
  component: () => {
    ;(globalThis as any).inChunk = [${base}, ${sub}]
    return <p>{new ${sub}() instanceof ${base} && new ${base}().o() === ${sub} ? ${sub}.m : 'WRONG'}</p>
  },
})
`

const renderEntry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

const entries = (shape: Shape) => ({
  // nothing but the route's chunk imports them: they stay lazy
  'only the route': `${renderEntry}export { Route } from './routes/index'\n`,
  // other modules import both through the route file: one instance
  'both exports': `${renderEntry}export { Route, ${shape.names.join(', ')} } from './routes/index'\n`,
})

const builds: Record<
  string,
  (files: Record<string, string>) => Promise<BuildResult>
> = {
  vite: (files) =>
    build({ bundler: 'vite', env: 'client', minify: false, files }),
  rspack: (files) =>
    build({ bundler: 'rspack', env: 'client', minify: false, files }),
  webpack: (files) =>
    build({ bundler: 'webpack', env: 'client', minify: false, files }),
  rsbuild: (files) => buildWithRsbuild({ files, registerCleanup: () => {} }),
}

describe.each(Object.keys(builds))('on %s', (bundler) => {
  describe.each(Object.keys(shapes) as Array<keyof typeof shapes>)(
    '%s',
    (name) => {
      const shape = shapes[name]
      test.each(['only the route', 'both exports'] as const)(
        'runs when the entry imports %s',
        async (kind) => {
          const app = await builds[bundler]!({
            'routes/__root.tsx': rootRoute,
            'routes/index.tsx': route(shape),
            'entry.ts': entries(shape)[kind],
          })
          try {
            const { result } = await app.run(
              `const html = await entry.render(entry.Route.options.component)
return [html, ${
                kind === 'both exports'
                  ? `globalThis.inChunk[0] === entry.${shape.names[0]} && globalThis.inChunk[1] === entry.${shape.names[1]}`
                  : 'true'
              }]`,
            )
            expect(result).toEqual(['<p>MARK_CYCLE_END</p>', true])
            if (kind === 'only the route' && !('eager' in shape)) {
              expect(app.where('MARK_CYCLE_END')).toBe('lazy')
            }
          } finally {
            await app.dispose()
          }
        },
        timeout,
      )
    },
  )
})

// A one-way `extends` is no cycle: each keeps its own module, and importing the
// base through the route file doesn't load the subclass.
test(
  'control: a subclass of an export keeps its own module',
  async () => {
    const app = await build({
      bundler: 'vite',
      env: 'client',
      minify: false,
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/index.tsx': `${head}export class Base { static b = 'MARK_BASE_END' }
export class Sub extends Base { static s = 'MARK_SUB_END' }
export const Route = createFileRoute('/')({
  component: () => <p>{new Sub() instanceof Base ? Sub.s + Base.b : 'WRONG'}</p>,
})
`,
        'entry.ts': `${renderEntry}export { Route, Base } from './routes/index'\n`,
      },
    })
    try {
      expect(app.where('MARK_BASE_END')).toBe('eager')
      expect(app.where('MARK_SUB_END')).toBe('lazy')
    } finally {
      await app.dispose()
    }
  },
  timeout,
)

// Rollup orders modules differently from Rolldown. Only the render runs: a Node
// program on the SSR build, where it's the same module graph.
describe('on vite 7', () => {
  test.each(Object.keys(shapes) as Array<keyof typeof shapes>)(
    '%s runs',
    async (name) => {
      const shape = shapes[name]
      const vite = await viteVersions.find((v) => v.major === 7)!.load()
      const app = await createApp({
        dir: path.dirname(fileURLToPath(import.meta.url)),
        prefix: '.cyclic-exports-vite7-',
        files: {
          'routes/__root.tsx': rootRoute,
          'routes/index.tsx': route(shape),
          'entry.ts': entries(shape)['both exports'],
        },
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
          minify: false,
          rollupOptions: { output: { entryFileNames: 'entry.js' } },
        },
      })
      const { stdout } = await runNodeProgram(
        `const entry = await import(${JSON.stringify(path.join(outDir, 'entry.js'))})
console.log(await entry.render(entry.Route.options.component))`,
        { cwd: app.root },
      )
      expect(stdout.trim().split('\n').at(-1)).toBe('<p>MARK_CYCLE_END</p>')
    },
    timeout,
  )
})
