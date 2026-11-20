/**
 * `rsbuild build --watch` of a React Start app with RSC enabled
 * (`rsc-app.ts`, `watchWith`), served by `rsbuild preview` after the
 * rebuild of one edit: the rebuilt server follows the edited module as a
 * fresh build of the edited app does.
 */
import path from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { expect, test } from 'vitest'
import {
  answeredText,
  openRscPage,
  startRscRsbuildPreviewServer,
  waitForHydration,
} from './rsc-app'

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
  async () => {
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
    await page.page.click('[data-testid=call]')
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
