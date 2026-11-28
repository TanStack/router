/**
 * A production build of a React Start app with RSC enabled on Rsbuild
 * (`rsc-app.ts`) whose server fn only client code calls (`<ClientOnly>`)
 * renders a `'use client'` component (`Inner`) that calls another server fn:
 * the nested chain of KNOWN-BUGS ("Rsbuild RSC build: a client component
 * only a late server fn renders is missing from the client manifest"). Its
 * workaround: a server fn the build reaches before the client build (a
 * route's loader calls it) renders `Inner` too, so the client manifest has
 * it and both clicks answer.
 */
import { expect, test } from 'vitest'
import { answeredText, waitForHydration } from './rsc-app'
import { openRscPage, startRscRsbuildPreviewServer } from './rsc-serial'

const timeout = 60_000

const files = {
  'src/nested/deep.ts': `import { createServerFn } from '@tanstack/react-start'
export const deep = createServerFn().handler(() => 'MARK_DEEP')
`,
  'src/nested/Inner.tsx': `'use client'
import { useState } from 'react'
import { deep } from './deep'
export function Inner() {
  const [result, setResult] = useState('')
  return (
    <button data-testid="inner" onClick={() => deep().then(setResult, (error) => setResult('error ' + error))}>
      inner {result}
    </button>
  )
}
`,
  'src/nested/outer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Inner } from './Inner'
export const outer = createServerFn().handler(() => renderServerComponent(<section>nested <Inner /></section>))
`,
  'src/routes/nested.tsx': `import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { outer } from '../nested/outer'
export const Route = createFileRoute('/nested')({ component: Page })
function Page() {
  const [node, setNode] = useState<ReactNode>(null)
  const [state, setState] = useState('none')
  return (
    <main>
      <ClientOnly fallback={<span>loading</span>}>
        <button data-testid="outer" onClick={() => outer().then((n) => { setNode(n as ReactNode); setState('answered') }, (error) => setState('error ' + error))}>
          outer {state}
        </button>
      </ClientOnly>
      {node}
    </main>
  )
}
`,
}

test(
  'a component a server fn the build reaches first renders: both clicks answer',
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        ...files,
        'src/nested/early.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Inner } from './Inner'
export const early = createServerFn().handler(() => renderServerComponent(<div>early <Inner /></div>))
`,
        'src/routes/early.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { early } from '../nested/early'
export const Route = createFileRoute('/early')({
  loader: async () => ({ tree: await early() }),
  component: () => <main>{Route.useLoaderData().tree}</main>,
})
`,
      },
    })
    expect(server.errors).toEqual([])
    const page = await openRscPage(server, '/nested')
    await waitForHydration(page)
    await page.locator('[data-testid=outer]').click()
    await page.locator('[data-testid=inner]').click()
    expect(
      await answeredText(
        page,
        '[data-testid=inner]',
        (text) => text.includes('MARK_') || text.includes('error'),
      ),
    ).toBe('inner MARK_DEEP')
  },
  timeout,
)
