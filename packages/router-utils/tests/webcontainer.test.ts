import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { analyzeModule, generateModule } from '../src'

vi.mock('yuku-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('yuku-core')>()),
  load: () => {
    throw new Error('WebContainers cannot load native addons')
  },
}))

// WebContainers report the previous call's byte counts for
// `TextEncoder.encodeInto('')`: https://github.com/stackblitz/webcontainer-core/issues/2173
const encodeInto = TextEncoder.prototype.encodeInto

beforeAll(() => {
  process.versions.webcontainer = '1.0.0'
  let previous = { read: 0, written: 0 }
  TextEncoder.prototype.encodeInto = function (source, destination) {
    if (source === '') {
      return previous
    }
    previous = encodeInto.call(this, source, destination)
    return previous
  }
})

afterAll(() => {
  delete process.versions.webcontainer
  TextEncoder.prototype.encodeInto = encodeInto
})

test('analyzes and prints modules with the WebAssembly core in WebContainers', () => {
  const code = `import { lazy } from 'react'
const Page = lazy(() => import('./page'))
export const render = (props: { id: string }) => <Page id={props.id} />
`
  const module = analyzeModule({ code, filename: 'route.tsx' })
  expect(module.rootScope.find('Page')!.references).toHaveLength(1)
  expect(module.rootScope.find('lazy')!.references).toHaveLength(1)
  expect(generateModule(module.ast).code).toMatchInlineSnapshot(`
    "import { lazy } from 'react';
    const Page = lazy(() => import('./page'));
    export const render = (props: {
      id: string;
    }) => <Page id={props.id} />;"
  `)
})

test('analyzes an empty module in WebContainers', () => {
  analyzeModule({ code: 'export const value = 1', filename: 'value.ts' })
  const module = analyzeModule({ code: '', filename: 'empty.ts' })
  expect(module.ast.body).toEqual([])
  expect(generateModule(module.ast).code).toBe('')
})
