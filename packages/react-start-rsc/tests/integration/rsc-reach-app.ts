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
 * `everyOutcome` clicks each button of a running app (a dev server or a
 * served build), each in a page of its own, and records the server fn's
 * response and the value the page shows; `editedReach` is a real edit of
 * every server fn. Used by the
 * rsc-reach-* files (Vite dev, Rsbuild dev, Rsbuild warm builds); the
 * fresh production builds of the same graphs are rsc-start-build.test.ts
 * and rsc-start-rsbuild-build.test.ts (a Vite production build fails on
 * the client-only positions: rsc-start-build-not-provided.test.ts).
 */
import { expect } from 'vitest'
import {
  clickOutcome,
  clientOnlyPositions,
  clientOnlyReachFiles,
} from './client-only-reach-app'
import type { ClickOutcome } from './client-only-reach-app'
import type { Browser } from './rsc-app'

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

/** The test ids of the buttons: the client-only positions and the counter. */
const buttons = [...clientOnlyPositions.map(({ name }) => name), 'counter']

/** The test's browser and signal. */
interface Actor {
  browser: Browser
  signal: AbortSignal
}

/**
 * What every button's click gives (`clickOutcome`), each clicked in a page
 * of its own (a new context of `browser`), by test id; a click that failed
 * is recorded as its error. Stops at the test's timeout (`signal`).
 */
export async function everyOutcome(
  { browser, signal }: Actor,
  server: { url?: string },
): Promise<Record<string, ClickOutcome | Error>> {
  const outcomes: Record<string, ClickOutcome | Error> = {}
  for (const name of buttons) {
    signal.throwIfAborted()
    const context = await browser.newContext()
    try {
      outcomes[name] = await clickOutcome(
        await context.newPage(),
        server,
        name,
      ).catch((error: Error) => error)
    } finally {
      await context.close()
    }
  }
  return outcomes
}

/**
 * `name`'s expected outcome: its click answered 200 and the button shows
 * its server fn's value (`edited`: after `editedReach`).
 */
export const answer = (name: string, edited = false): ClickOutcome => ({
  status: 200,
  text: `${name} ${marker(name, edited)}`,
})

/**
 * The reach gate across a dev server's history, one named checkpoint each:
 * a fresh start, a restart (`restart()`, giving the restarted server) and
 * a real edit of every server fn; every button answers at each
 * (`everyOutcome`).
 */
export async function expectReachHistory(
  actor: Actor,
  server: { url?: string; edit: (files: Record<string, string>) => unknown },
  restart: () => Promise<typeof server>,
) {
  const answers = (edited?: boolean) =>
    Object.fromEntries(buttons.map((name) => [name, answer(name, edited)]))
  expect
    .soft(await everyOutcome(actor, server), 'a fresh start')
    .toEqual(answers())
  server = await restart()
  expect
    .soft(await everyOutcome(actor, server), 'after a restart')
    .toEqual(answers())
  await server.edit(editedReach())
  expect
    .soft(await everyOutcome(actor, server), 'after an edit of every server fn')
    .toEqual(answers(true))
}

/** The client-only positions (rows of `test.for`: `$position`, `$where`). */
export const reachPositions = clientOnlyPositions

/** The public counter's test name. */
export const counterTest =
  "a server fn only a 'use client' component of a server component imports answers (#7943)"
