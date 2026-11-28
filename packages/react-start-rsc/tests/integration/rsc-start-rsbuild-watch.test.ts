/**
 * `rsbuild build --watch` of a React Start app with RSC enabled
 * (`rsc-app.ts`, `watchWith`), served by `rsbuild preview` after the
 * rebuild of one edit: the rebuilt server follows the edited module as a
 * fresh build of the edited app does.
 */
import path from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { expect } from 'vitest'
import { answeredText, waitForHydration } from './rsc-app'
import { test } from './test'

const timeout = 120_000

const fns = (withFn: boolean) =>
  withFn
    ? `import { createServerFn } from '@tanstack/react-start'
export const old = createServerFn().handler(() => 'MARK_OLD')
`
    : `export const old = async () => 'MARK_PLAIN'
`

// The edit removes the module's only server fn: the module names no Start
// API any more, and the rebuilt server provides nothing of it (its custom
// id is in no output). c9701e2fc1: the rebuilt modules kept the record of
// their previous compile, so the server's manifest still listed it.
test(
  'a server fn an edit removes from its module leaves the rebuilt server',
  async ({ openRscPage, startRscRsbuildPreviewServer }) => {
    const server = await startRscRsbuildPreviewServer({
      start: {
        serverFns: {
          generateFunctionId: ({ functionName }: { functionName: string }) =>
            functionName.startsWith('old_') ? 'MARK_OLD_ID' : undefined,
        },
      },
      files: {
        'src/watched/fns.ts': fns(true),
        'src/routes/watched.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { old } from '../watched/fns'
export const Route = createFileRoute('/watched')({ component: Page })
function Page() {
  const [text, setText] = useState('none')
  return (
    <button data-testid="call" onClick={async () => setText(await old())}>
      {text}
    </button>
  )
}
`,
      },
      // (each emit removes the files of the build before: what the output
      // directory holds is the rebuild's)
      tools: { rspack: { output: { clean: true } } },
      watchWith: { 'src/watched/fns.ts': fns(false) },
    })
    expect(server.errors).toEqual([])
    const page = await openRscPage(server, '/watched')
    await waitForHydration(page)
    await page.click('[data-testid=call]')
    expect(
      await answeredText(page, '[data-testid=call]', (text) => text !== 'none'),
    ).toBe('MARK_PLAIN')
    const dist = path.join(server.root, 'dist')
    const holding: Array<string> = []
    for (const entry of await readdir(dist, {
      recursive: true,
      withFileTypes: true,
    })) {
      const file = path.join(entry.parentPath, entry.name)
      if (
        entry.isFile() &&
        (await readFile(file, 'utf8')).includes('MARK_OLD_ID')
      ) {
        holding.push(path.relative(dist, file))
      }
    }
    expect(holding).toEqual([])
  },
  timeout,
)

const calls = (
  fn: 'callA' | 'callB',
) => `import { createFileRoute } from '@tanstack/react-router'
import { createServerOnlyFn } from '@tanstack/react-start'
import { createClientRpc } from '@tanstack/react-start/client-rpc'
import { useState } from 'react'
import { callA } from '../moved/a'
import { callB } from '../moved/b'
const urls = createServerOnlyFn(() => ({ a: callA.url, b: callB.url }))
export const Route = createFileRoute('/moved')({ loader: () => urls(), component: Page })
if (typeof window !== 'undefined') {
  // Start's own client RPC of an id: the request a stub would send
  ;(window as any).callId = async (id: string) => {
    try {
      const reply = await createClientRpc(id)({})
      return 'error' in reply ? 'refused' : 'answered ' + String(reply.result)
    } catch {
      return 'refused'
    }
  }
}
function Page() {
  const data = Route.useLoaderData()
  const [text, setText] = useState('none')
  return (
    <main>
      <p data-testid="urls">{JSON.stringify(data)}</p>
      <button data-testid="call" onClick={async () => setText(await ${fn}())}>{text}</button>
    </main>
  )
}
`

// SPEC J4.2 (R182) in a watch rebuild: the edit moves the page's call from
// one server fn to another; the rebuilt server answers the browser for the
// one the rebuilt client calls and refuses the other (the resolver's gate
// follows the client build of the rebuild).
test(
  "an edit that moves the client's call to another server fn moves what the rebuilt server answers",
  async ({ openRscPage, startRscRsbuildPreviewServer }) => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        'src/moved/a.ts': `import { createServerFn } from '@tanstack/react-start'
export const callA = createServerFn().handler(() => 'MARK_A')
`,
        'src/moved/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const callB = createServerFn().handler(() => 'MARK_B')
`,
        'src/routes/moved.tsx': calls('callA'),
      },
      watchWith: { 'src/routes/moved.tsx': calls('callB') },
    })
    expect(server.errors).toEqual([])
    const page = await openRscPage(server, '/moved')
    await waitForHydration(page)
    await page.click('[data-testid=call]')
    expect(
      await answeredText(page, '[data-testid=call]', (text) => text !== 'none'),
    ).toBe('MARK_B')
    const urls = JSON.parse(
      (await page.locator('[data-testid=urls]').textContent())!,
    ) as {
      a: string
      b: string
    }
    const callId = (url: string) =>
      page.evaluate(
        (id) => (window as any).callId(id),
        url.slice(url.lastIndexOf('/') + 1),
      )
    expect({ a: await callId(urls.a), b: await callId(urls.b) }).toEqual({
      a: 'refused',
      b: 'answered MARK_B',
    })
  },
  timeout,
)
