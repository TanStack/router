/**
 * Start on Vite dev, routes never generated (every run of the generator
 * failed): a route module fails with the generator's error of the moment,
 * as the route tree does (SPEC R86). Another failure (the first conflict
 * fixed, another made) is the error of the module's next request (Vite
 * caches no transform that failed), and once the routes are generated the
 * module compiles.
 * Source: review A and G of design-routeset-v4 (follow-up F4: one
 * fingerprint for every cold generation failure, so the plan of the first
 * failure answered the next request).
 */
import { expect, test } from 'vitest'
import { mentionsFile } from '@tanstack/compiler-test-utils/diagnostics'
import { startDevServer } from '../dev-server'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 60_000

const route = (id: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('${id}')({})
`

/** The error of the client's request for `url` (none: undefined). */
async function requestError(server: DevServer, url: string) {
  try {
    await server.vite.environments.client.transformRequest(url)
    return undefined
  } catch (error) {
    // (Vite rethrows a plugin's error as an object with its message)
    return String((error as { message?: unknown }).message ?? error)
  }
}

test(
  'a second cold generation failure is the next error of a route module, and generated routes compile it',
  async () => {
    // `/a` twice: `a.tsx`, and `a.tsx` under the pathless layout `_l`
    const server = await startDevServer({
      files: {
        'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
        'src/routes/index.tsx': route('/'),
        'src/routes/about.tsx': route('/about'),
        'src/routes/a.tsx': route('/a'),
        'src/routes/_l.tsx': route('/_l'),
        'src/routes/_l/a.tsx': route('/_l/a'),
      },
    })
    const url = '/src/routes/about.tsx'
    const names = (error: string | undefined, file: string) =>
      error !== undefined &&
      mentionsFile(error, server.file(file), { root: server.root })

    const first = await requestError(server, url)
    expect(names(first, 'src/routes/_l/a.tsx')).toBe(true)

    // a conflict of `/b` made too, then the one of `/a` fixed: the routes
    // were never generated in between
    await server.write({
      'src/routes/b.tsx': route('/b'),
      'src/routes/_m.tsx': route('/_m'),
      'src/routes/_m/b.tsx': route('/_m/b'),
    })
    await expect
      .poll(
        async () =>
          names(await requestError(server, url), 'src/routes/_m/b.tsx'),
        { timeout: 10_000 },
      )
      .toBe(true)
    await server.write({ 'src/routes/_l/a.tsx': null })
    await expect
      .poll(
        async () =>
          !names(await requestError(server, url), 'src/routes/_l/a.tsx'),
        { timeout: 10_000 },
      )
      .toBe(true)
    expect(names(await requestError(server, url), 'src/routes/_m/b.tsx')).toBe(
      true,
    )

    // and fixed
    await server.write({ 'src/routes/_m/b.tsx': null })
    await expect
      .poll(() => requestError(server, url), { timeout: 10_000 })
      .toBeUndefined()
  },
  timeout,
)
