/**
 * The server-fn reach gate: one RSC app with two consumer graphs whose
 * server fns only client code calls, which restarts and caches affect in
 * opposite ways (RSC investigation, Astra 11-19), so neither stands in for
 * the other:
 * - the public #7943 counter: a POST server fn whose only importer is a
 *   `'use client'` component a server component renders, with no route
 *   import of the component (`/client-ref`);
 * - the six client-only positions of `client-only-reach-app.ts`
 *   (`<ClientOnly>` child, `createClientOnlyFn` body, `<Hydrate>` fallback;
 *   route file and component file).
 * `clickEveryButton` clicks each button of a running app (a dev server or a
 * served build) and records the server fn's response and the value the
 * page shows; `editedReach` is a real edit of every server fn. Used by the
 * rsc-reach-* files (Vite dev, Rsbuild dev, Rsbuild warm builds); the
 * fresh production builds of the same graphs are rsc-start-build.test.ts
 * and rsc-start-rsbuild-build.test.ts (a Vite production build fails on
 * the client-only positions: rsc-start-build-not-provided.test.ts).
 */
import { expect } from 'vitest'
import {
  clientOnlyPositions,
  clientOnlyReachFiles,
} from './client-only-reach-app'
import { answeredText, openRscPage, waitForHydration } from './rsc-app'

/** The public #7943 counter (`G4RDS/tanstack-router-7943-repro`'s shape). */
export const publicCounterFiles = {
  'src/client-ref/update.ts': `import { createServerFn } from '@tanstack/react-start'
export const update = createServerFn({ method: 'POST' }).handler(() => 'MARK_COUNTER')
`,
  'src/client-ref/Counter.tsx': `'use client'
import { useState } from 'react'
import { update } from './update'
export function Counter() {
  const [result, setResult] = useState('')
  return (
    <button data-testid="counter" onClick={() => update().then(setResult, (error) => setResult('error ' + error))}>
      counter {result}
    </button>
  )
}
`,
  'src/client-ref/page.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Counter } from './Counter'
export const getPage = createServerFn().handler(() => renderServerComponent(<div>server <Counter /></div>))
`,
  'src/routes/client-ref.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getPage } from '../client-ref/page'
export const Route = createFileRoute('/client-ref')({
  loader: async () => ({ tree: await getPage() }),
  component: Page,
})
function Page() {
  return <main>{Route.useLoaderData().tree}</main>
}
`,
}

export const reachFiles = {
  ...publicCounterFiles,
  ...clientOnlyReachFiles,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <main>index</main> })
`,
}

/** The server fn module of each button, by its test id. */
const serverFnFiles: Record<string, string> = {
  counter: 'src/client-ref/update.ts',
  ...Object.fromEntries(
    clientOnlyPositions.map(({ name }) => [name, `src/client-only/${name}.ts`]),
  ),
}

/** What each server fn answers, by test id (`edited`: after `editedReach`). */
export function marker(name: string, edited = false): string {
  return `MARK_${name.toUpperCase()}${edited ? '_EDITED' : ''}`
}

/**
 * A real edit of every server fn of `reachFiles`: each handler answers its
 * `marker(name, true)`.
 */
export function editedReach(): Record<string, string> {
  const edits: Record<string, string> = {}
  for (const [name, file] of Object.entries(serverFnFiles)) {
    const code = (reachFiles as Record<string, string>)[file]!
    const edited = code.replace(`'${marker(name)}'`, `'${marker(name, true)}'`)
    if (edited === code) {
      throw new Error(`${file} does not answer ${marker(name)}`)
    }
    edits[file] = edited
  }
  return edits
}

/** A click's outcome: the server fn's HTTP status and the button's text. */
export interface ClickOutcome {
  status: number
  text: string
}

/**
 * Clicks every button of the app at `server` (the `<Hydrate>` fallbacks
 * after a client-side navigation, the only way they show), one after
 * another, and records each outcome by test id; a click that got no
 * answer, or no server fn response, is recorded as the error it is (a
 * broken run, not the outcome under test: `expectAnswer` rethrows it).
 */
export async function clickEveryButton(server: {
  url: string | undefined
}): Promise<Record<string, ClickOutcome | Error>> {
  const outcomes: Record<string, ClickOutcome | Error> = {}
  const click = async (
    page: Awaited<ReturnType<typeof openRscPage>>,
    name: string,
  ) => {
    const selector = `[data-testid=${name}]`
    try {
      const response = page.page.waitForResponse(
        (r) => r.url().includes('/_serverFn/'),
        { timeout: 15_000 },
      )
      await page.page.locator(selector).click()
      const status = (await response).status()
      const text = await answeredText(
        page,
        selector,
        (value) => value.includes('MARK_') || value.includes('error'),
      )
      outcomes[name] = { status, text }
    } catch (error) {
      outcomes[name] = error instanceof Error ? error : new Error(String(error))
    }
  }
  // (closed here: the clicks run in a hook, outside any test)
  const open = async (pathname: string) => {
    const page = await openRscPage(server, pathname, {
      registerCleanup: () => {},
    })
    await waitForHydration(page)
    return page
  }
  const positions = await open('/client-only')
  try {
    for (const { name } of clientOnlyPositions) {
      if (!name.startsWith('hydrate')) {
        await click(positions, name)
      }
    }
    await positions.page.locator('[data-testid=to-hydrate]').click()
    for (const { name } of clientOnlyPositions) {
      if (name.startsWith('hydrate')) {
        await click(positions, name)
      }
    }
  } finally {
    await positions.close()
  }
  const counter = await open('/client-ref')
  try {
    await click(counter, 'counter')
  } finally {
    await counter.close()
  }
  return outcomes
}

/**
 * `name`'s click answered 200 and the button shows its server fn's value
 * (`edited`: after `editedReach`).
 */
export function expectAnswer(
  outcomes: Record<string, ClickOutcome | Error>,
  name: string,
  edited = false,
) {
  const outcome = outcomes[name]
  if (!outcome) {
    throw new Error(`${name}: not clicked`)
  }
  if (outcome instanceof Error) {
    throw outcome
  }
  expect(outcome).toEqual({
    status: 200,
    text: `${name} ${marker(name, edited)}`,
  })
}

/** The client-only positions (rows of `test.for`: `$position`, `$where`). */
export const reachPositions = clientOnlyPositions

/** The public counter's test name. */
export const counterTest =
  "a server fn only a 'use client' component of a server component imports answers (#7943)"
