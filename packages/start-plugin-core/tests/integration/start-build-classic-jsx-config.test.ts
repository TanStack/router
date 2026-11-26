/**
 * A classic JSX transform the tsconfig asks for (`"jsx": "react"`, no
 * pragma) calls the module's `React.createElement` where JSX is: a `React`
 * of the module's own is read there, so a type naming it does not remove it
 * (a type never keeps a value; Gemini's re-check of 52b0c43a0e). Start's
 * Vite build compiles JSX with the automatic runtime whatever the tsconfig
 * says; here Rsbuild's SWC is set to the classic one.
 */
import { expect, test } from 'vitest'
import { buildStart } from '../build-harness'

test('rsbuild build: a React of the module a classic JSX setting calls stays', async () => {
  const build = await buildStart({
    bundler: 'rsbuild',
    files: {
      'src/module.tsx': `import { createServerFn } from '@tanstack/react-start'
const React = { createElement: (type: unknown) => type }
export const fn = createServerFn().handler(async () => 1)
export const show = (unused?: typeof React) => <b />
`,
      'src/entry.ts': `export { show } from './module'\n`,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react',
          strict: true,
        },
      }),
    },
    entry: 'src/entry.ts',
    rsbuildConfig: {
      tools: {
        swc: { jsc: { transform: { react: { runtime: 'classic' } } } },
      },
    },
  })
  expect((await build.client.run('return entry.show()')).result).toBe('b')
}, 60_000)
