import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { analyzeModule, cloneModuleAst, generateModule } from '../src'

vi.mock('yuku-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('yuku-core')>()),
  load: () => {
    throw new Error('WebContainers cannot load native addons')
  },
}))

beforeAll(() => {
  process.versions.webcontainer = '1.0.0'
})

afterAll(() => {
  delete process.versions.webcontainer
})

test('analyzes and prints modules with the WebAssembly core in WebContainers', () => {
  const code = `import { lazy } from 'react'
const Page = lazy(() => import('./page'))
export const render = (props: { id: string }) => <Page id={props.id} />
`
  const module = analyzeModule({ code, filename: 'route.tsx' })
  expect(module.rootScope.find('Page')!.references).toHaveLength(1)
  expect(module.rootScope.find('lazy')!.references).toHaveLength(1)
  expect(generateModule(cloneModuleAst(module).program).code)
    .toMatchInlineSnapshot(`
    "import { lazy } from 'react';
    const Page = lazy(() => import('./page'));
    export const render = (props: {
      id: string;
    }) => <Page id={props.id} />;"
  `)
})
