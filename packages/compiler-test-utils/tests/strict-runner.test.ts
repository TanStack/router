/**
 * Contract test of the strict module runner (strict-runner.ts): server
 * code still resolves, loads and evaluates through Vite's own module runner, and a static import of a name the
 * imported module does not export throws as an ES module link does,
 * instead of reading `undefined` (what Vite's runner does for an inlined
 * module). Namespace imports, dynamic imports and import cycles keep their
 * ES semantics.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServerModuleRunner } from 'vite'
import { expect, onTestFinished, test } from 'vitest'
import { createDevServer } from '../src/dev-server'

const testsDir = path.dirname(fileURLToPath(import.meta.url))

const files = {
  'src/a.ts': `export const present = 'present'\n`,
  'src/missing.ts': `import { present, absent } from './a'
export const read = () => [present, absent]
`,
  'src/reexport.ts': `export { absent } from './a'\n`,
  'src/namespace.ts': `import * as a from './a'
export const read = () => [a.present, (a as Record<string, unknown>).absent]
`,
  'src/dynamic.ts': `export const read = async () => (await import('./a') as Record<string, unknown>).absent\n`,
  'src/cycle-a.ts': `import { b } from './cycle-b'
export const a = 'a'
export const read = () => b()
`,
  'src/cycle-b.ts': `import { a } from './cycle-a'
export const b = () => a
`,
  // A dependency's module keeps Vite's dev semantics (its plugins rely on
  // them; a production build links it)
  'node_modules/dep/package.json': `{ "name": "dep", "type": "module", "main": "./index.js" }`,
  'node_modules/dep/index.js': `import { absent } from './other.js'
export const read = () => absent
`,
  'node_modules/dep/other.js': `export const present = 1\n`,
  'src/uses-dep.ts': `export { read } from 'dep'\n`,
}

async function server() {
  return createDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files,
  })
}

test("Vite's own runner reads a missing named import as undefined (the gap the adapter closes)", async () => {
  const dev = await server()
  const runner = createServerModuleRunner(dev.vite.environments.ssr, {
    hmr: false,
  })
  onTestFinished(() => runner.close())
  const module = await runner.import('/src/missing.ts')
  expect(module.read()).toEqual(['present', undefined])
})

test('a static import of a name the module does not export throws', async () => {
  const dev = await server()
  await expect(dev.import('/src/missing.ts')).rejects.toThrow(
    /does not provide an export named 'absent'/,
  )
  await expect(dev.import('/src/reexport.ts')).rejects.toThrow(
    /does not provide an export named 'absent'/,
  )
})

test("a dependency's own imports keep Vite's dev semantics", async () => {
  const dev = await createDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files,
    // Inlined, as a linked workspace package or a plugin's runtime is
    config: { ssr: { noExternal: ['dep'] } },
  })
  expect((await dev.import('/src/uses-dep.ts')).read()).toBeUndefined()
})

test('namespace imports, dynamic imports and cycles keep their ES semantics', async () => {
  const dev = await server()
  expect((await dev.import('/src/namespace.ts')).read()).toEqual([
    'present',
    undefined,
  ])
  expect(await (await dev.import('/src/dynamic.ts')).read()).toBeUndefined()
  expect((await dev.import('/src/cycle-a.ts')).read()).toBe('a')
})

test("the environment's own runner is the strict one (a plugin importing through it gets the check)", async () => {
  const dev = await server()
  const environment = dev.vite.environments.ssr as unknown as {
    runner: { import: (url: string) => Promise<unknown> }
  }
  await expect(environment.runner.import('/src/missing.ts')).rejects.toThrow(
    SyntaxError,
  )
})

test('a virtual module an app module imports (a compiler support module) gets the check too', async () => {
  const dev = await createDevServer({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files: {
      ...files,
      'src/uses-support.ts': `export { read } from 'virtual:support'\n`,
    },
    plugins: [
      {
        name: 'support',
        resolveId: (id) =>
          id === 'virtual:support' ? '\0virtual:support' : undefined,
        load: (id) =>
          id === '\0virtual:support'
            ? `import { absent } from '/src/a.ts'\nexport const read = () => absent\n`
            : undefined,
      },
    ],
  })
  await expect(dev.import('/src/uses-support.ts')).rejects.toThrow(
    /does not provide an export named 'absent'/,
  )
})
