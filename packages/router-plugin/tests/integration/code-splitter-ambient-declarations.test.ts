// An ambient declaration is erased by TypeScript, but the transforms after
// the compiler read it while they compile the file that holds it: with a
// tsconfig (any, so every app), Vite 8's Oxc inlines the members of a
// `declare enum` and a `declare const enum`; Rsbuild's built-in SWC inlines
// those of a `declare const enum`. The route module keeps the declaration and
// inlines; a split chunk reading the enum gets a copy of it, exported or not,
// or it reads a name that exists nowhere at runtime (a `ReferenceError`).
// Source: a study of every host transform with and without the declaration
// (Oxc, SWC, esbuild, tsc, Babel), whole-PR review C2-10.
import { describe, expect, it } from 'vitest'
import { build, head, routeApp } from '../build-harness'

type Bundler = 'vite' | 'rspack'

const tsconfig = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'react-jsx',
    strict: true,
  },
})

/** The loader's value and the split component's render, from a production SSR build. */
async function loaderAndComponent(bundler: Bundler, declaration: string) {
  const app = await build({
    bundler,
    env: 'ssr',
    minify: false,
    prefix: '.regression-build-',
    files: routeApp(
      `${head}${declaration}
export const Route = createFileRoute('/')({
  loader: () => Flags.On,
  component: () => <p>{Flags.On}</p>,
})
`,
      { files: { 'tsconfig.json': tsconfig } },
    ),
  })
  try {
    const { result } = await app.run(
      `const { component, loader } = entry.Route.options
let rendered
try {
  rendered = await entry.render(component)
} catch (error) {
  rendered = error.name
}
return [loader(), rendered, typeof component.preload]`,
    )
    return result
  } finally {
    await app.dispose()
  }
}

describe('a split component reads a member of an ambient enum the route module declares', () => {
  it.each<{ declaration: string; bundler: Bundler }>([
    ...(['vite', 'rspack'] as const).flatMap((bundler) => [
      { declaration: 'export declare const enum Flags { On = 1 }', bundler },
      // the unexported spelling, copied before too
      { declaration: 'declare const enum Flags { On = 1 }', bundler },
    ]),
    // (Rsbuild's SWC inlines no `declare enum`: there both modules read the
    // global, which this app does not define)
    { declaration: 'export declare enum Flags { On = 1 }', bundler: 'vite' },
  ])(
    '$declaration ($bundler)',
    async ({ declaration, bundler }) => {
      expect(await loaderAndComponent(bundler, declaration)).toEqual([
        1,
        '<p>1</p>',
        'function',
      ])
    },
    60_000,
  )
})
