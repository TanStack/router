/** Observable Start runtime contracts that mutation testing found unchecked. */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildStartShared, startBundlers } from '../build-harness'
import {
  openAppPage,
  pageEntries,
  rootDocument,
  routerFile,
  serveStartBuildShared,
  startPageEntries,
} from './start-compose-app'
import type { serveStartBuild } from './start-compose-app'

const files = {
  ...startPageEntries,
  ...pageEntries,
  'src/router.ts': routerFile,
  'src/routes/__root.tsx': rootDocument(),
  // SPEC J4.2/J4.14. Importing the RPC
  // provider must preserve a default-export expression's observable effect.
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
let ready = false
let released = false
let complete: (() => void) | undefined
export default (ready = true)
export const readReady = createServerFn().handler(() => ready)
export const slow = createServerFn().handler(async () => {
  if (!released) {
    await new Promise<void>((resolve) => { complete = resolve })
  }
  return 'completed'
})
export const release = createServerFn().handler(() => {
  released = true
  complete?.()
  return 'released'
})
`,
  'src/client-entry.ts': `export { readReady, slow, release } from './fns'
export { getRouter } from './router'
`,
  // SPEC J4.1/G8. The same real Zod schema
  // validates server input and is consumed by a live browser component.
  'src/routes/index.tsx': `import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
const postSchema = z.object({ title: z.string().min(1) })
export const createPost = createServerFn({ method: 'POST' }).validator(postSchema).handler(({ data }) => data.title)
export const Route = createFileRoute('/')({ component: PostForm })
function PostForm() {
  const [result, setResult] = useState('')
  function submit() {
    const form = { title: 'browser title' }
    const parsed = postSchema.safeParse(form)
    if (parsed.success) {
      void createPost({ data: parsed.data }).then(setResult)
    }
  }
  return <><button data-testid="submit" onClick={submit}>submit</button><p data-testid="result">{result}</p></>
}
`,
}

describe.each(startBundlers)('%s build runtime outcomes', (bundler) => {
  let served: Awaited<ReturnType<typeof serveStartBuild>>
  let building: Promise<{ close: () => Promise<void> }> | undefined
  let serving: Promise<{ close: () => Promise<void> }> | undefined
  afterAll(async () => {
    await serving?.then(
      (opened) => opened.close(),
      () => {},
    )
    await building?.then(
      (opened) => opened.close(),
      () => {},
    )
  })
  beforeAll(async () => {
    const build = await (building = buildStartShared({
      bundler,
      files,
    }))
    served = await (serving = serveStartBuildShared(build))
  }, 60_000)

  test('a provider keeps the effect of a default-export expression over HTTP', async () => {
    const page = await openAppPage(served, '/')
    expect(
      await page.page.evaluate(() => (globalThis as any).__app.readReady()),
    ).toBe(true)
    expect(page.errors).toEqual([])
  })

  test('a validator schema also used by a component works after hydration', async () => {
    const page = await openAppPage(served, '/')
    await page.page.locator('[data-testid=submit]').click()
    await page.waitForText('browser title', {
      selector: '[data-testid=result]',
    })

    expect(page.errors).toEqual([])
  })

  test('aborting a browser RPC cancels the in-flight HTTP request', async () => {
    const page = await openAppPage(served, '/')
    // SPEC J4.1. Abort an actual in-flight
    // browser HTTP call, after the request has left the page. No fake fetch.
    const request = page.page.waitForRequest((req) =>
      req.url().includes('/_serverFn/'),
    )
    await page.page.evaluate(() => {
      const app = globalThis as any
      app.abortController = new AbortController()
      app.pendingCall = app.__app
        .slow({ signal: app.abortController.signal })
        .then(
          () => 'completed',
          (error: Error) => error.name,
        )
    })
    await request
    const outcome = await page.page.evaluate(async () => {
      const app = globalThis as any
      app.abortController.abort()
      await app.__app.release()
      return await app.pendingCall
    })
    expect(outcome).toBe('AbortError')
    expect(page.errors).toEqual([])
  })
})
