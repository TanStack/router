/**
 * Pin: a lowercase component binding with a type annotation (`const comp: FC`)
 * in React dev. Route HMR renames lowercase bindings so React Refresh registers
 * them; the references are renamed and the annotated declaration isn't, so the
 * route reads an undeclared name and the page is dead. Production builds, Solid
 * and capitalised bindings are not affected. The control shows the same route
 * without the annotation works.
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import { inPlace } from '../route-hmr-edit'
import type { TestContext } from 'vitest'

const route = (declaration: string, version: string) =>
  `import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { FC } from 'react'
${declaration} = () => {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>page ${version} count {count}</button>
}
export const Route = createFileRoute('/')({ component: comp })
`

const run = async (
  declaration: string,
  { expect, onTestFinished }: TestContext,
) => {
  const file = 'routes/index.tsx'
  const app = await openRouteHmrPage({
    onTestFinished,
    pluginOptions: { autoCodeSplitting: false },
    files: { [file]: route(declaration, 'v1') },
    ready: 'page v1 count 0',
  })
  await app.click('button')
  await app.page.waitForText('page v1 count 1', { selector: '#app' })
  expect(
    await app.edit({ [file]: route(declaration, 'v2') }, 'page v2 count 1'),
  ).toEqual(inPlace)
}

describe.concurrent(
  'a lowercase component binding',
  { timeout: 60_000 },
  () => {
    test('without an annotation renders and updates in place', (ctx) =>
      run('const comp', ctx))

    test.fails('with a type annotation renders and updates in place', (ctx) =>
      run('const comp: FC', ctx),
    )
  },
)
