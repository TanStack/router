/**
 * SPEC J4.4 in Vite development: what a by-id request (`/_serverFn/<id>`)
 * can make the dev server run. An id comes from the caller and names the
 * file that defines the fn, so a request may name any file. The dev lookup
 * answers the ids a compile of this dev session registered; for any other
 * id it compiles the file the id names only when that file, symlinks
 * resolved, is inside the app's `srcDirectory` and not in a `node_modules`
 * directory (so a page left open across a restart keeps working), and
 * refuses the rest like an unknown id.
 *
 * Every request here is a real HTTP request to a listening Vite dev server,
 * with the headers Start's client RPC sends (and the `Sec-Fetch-Site` a
 * same-origin page's browser adds). The ids are the ones the client code
 * the server serves holds (the dev id encodes the file and the fn's key):
 * a forged id swaps only the file. Each target module records on a global
 * when its top-level code runs (the SSR environment runs in this process).
 */
import path from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { pluginReact } from '@rsbuild/plugin-react'
import { closeAfterAll } from '../file-end'
import { startDevServerShared, startRequestFiles } from '../dev-server'
import { startRsbuildStartDevServerShared } from '../rsbuild-dev-server'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const timeout = 60_000

const ranKey = '__devFnScopeRan'

/** A module whose server fn `internal` answers `MARK_<name>`, recording that its top-level code ran. */
const fnModule = (
  name: string,
) => `import { createServerFn } from '@tanstack/react-start'
;(globalThis.${ranKey} ??= []).push('${name}')
export const internal = createServerFn().handler(() => 'MARK_${name}')
`

const packageJson = (name: string) =>
  JSON.stringify({ name, type: 'module', exports: { './fns': './fns.js' } })

const files = {
  ...startRequestFiles,
  // the app's fn (the control: its id is the one the forged ids derive from)
  'src/fns.ts': fnModule('APP'),
  // in `src`, imported by nothing
  'src/other.ts': fnModule('OTHER'),
  // in the root, outside `src`
  'scripts/admin.ts': fnModule('ADMIN'),
  'scripts/dotdot.ts': fnModule('DOTDOT'),
  'scripts/absolute.ts': fnModule('ABSOLUTE'),
  'scripts/linked.ts': fnModule('LINKED'),
  // a package nothing compiles
  'node_modules/evil-pkg/package.json': packageJson('evil-pkg'),
  'node_modules/evil-pkg/fns.js': fnModule('EVIL'),
  'node_modules/evil-pkg/dotdot.js': fnModule('EVIL_DOTDOT'),
  'node_modules/evil-pkg/linked.js': fnModule('EVIL_LINKED'),
  // a package whose module the client compiles in the session
  'node_modules/lib-pkg/package.json': packageJson('lib-pkg'),
  'node_modules/lib-pkg/fns.js': fnModule('LIB'),
}

const symlinks = {
  'src/linked.ts': 'scripts/linked.ts',
  'src/evil-linked.js': 'node_modules/evil-pkg/linked.js',
}

interface DevId {
  f: string
  k: string
}

const decode = (id: string): DevId =>
  JSON.parse(Buffer.from(id, 'base64url').toString('utf8'))
const encode = (id: DevId) =>
  Buffer.from(JSON.stringify(id), 'utf8').toString('base64url')

/**
 * Calls `id` over HTTP on the server at `url`: the fn's answer, or
 * `refused` (Start's error status, with the resolver's `refusal` message for
 * an unknown id).
 */
async function callAt(
  url: string,
  id: string,
  refusal: string,
): Promise<string> {
  const response = await fetch(new URL(`/_serverFn/${id}`, url), {
    headers: {
      'x-tsr-serverFn': 'true',
      'sec-fetch-site': 'same-origin',
      accept: 'application/json',
    },
  })
  const body = await response.text()
  if (response.status === 200) {
    return /MARK_\w+/.exec(body)?.[0] ?? body
  }
  expect(response.status).toBe(500)
  expect(body).toContain(refusal)
  return 'refused'
}

/**
 * Ids no compile of the session registered, by what they name: the file the
 * forged id names (root-relative, or `ABSOLUTE`: the absolute path of the
 * file it reaches) and the file it reaches.
 */
const outOfScope: Array<[string, string, string]> = [
  ['a file in the root outside src', 'scripts/admin.ts', 'scripts/admin.ts'],
  [
    'a package fn nothing compiled',
    'node_modules/evil-pkg/fns.js',
    'node_modules/evil-pkg/fns.js',
  ],
  ['a `..` escape out of src', 'src/../scripts/dotdot.ts', 'scripts/dotdot.ts'],
  [
    'a `..` escape into node_modules',
    'src/../node_modules/evil-pkg/dotdot.js',
    'node_modules/evil-pkg/dotdot.js',
  ],
  ['an absolute path outside src', 'ABSOLUTE', 'scripts/absolute.ts'],
  ['a symlink in src to a file outside', 'src/linked.ts', 'scripts/linked.ts'],
  [
    'a symlink in src into node_modules',
    'src/evil-linked.js',
    'node_modules/evil-pkg/linked.js',
  ],
]

/** The top-level code runs recorded so far. */
const ran = () =>
  ((globalThis as Record<string, unknown>)[ranKey] as
    | Array<string>
    | undefined) ?? []

describe('vite dev: by-id requests', () => {
  let server: DevServer
  /** The id of `src/fns.ts`'s `internal`, as the client code holds it. */
  let appId: string

  /** The server fn id in the client code the server serves at `url`. */
  async function clientId(url: string): Promise<string> {
    const { status, body } = await server.fetch(url)
    expect(status).toBe(200)
    const ids = [...body.matchAll(/ClientServerFn\(\s*"([^"]+)"/g)]
    expect(ids).toHaveLength(1)
    return ids[0]![1]!
  }

  /** The id naming `file` (root-relative, or absolute) with the app fn's key. */
  const naming = (file: string) => encode({ ...decode(appId), f: file })

  const call = (id: string) =>
    callAt(server.url!, id, 'Server function info not found for')

  const opening = closeAfterAll()
  beforeAll(async () => {
    server = await opening(() =>
      startDevServerShared({
        listen: true,
        files,
        symlinks,
      }),
    )
    appId = await clientId('/src/fns.ts')
    expect(decode(appId).f).toBe('src/fns.ts')
  }, timeout)

  test(
    'the app fn the client compiled answers (control)',
    async () => {
      expect(await call(appId)).toBe('MARK_APP')
    },
    timeout,
  )

  test(
    'an id naming a file in src that nothing imports compiles it and answers',
    async () => {
      expect(await call(naming('src/other.ts'))).toBe('MARK_OTHER')
    },
    timeout,
  )

  // Each case requests the forged id, then the id naming the file it reaches
  // (a compile on the forged request would have registered that one): both
  // are refused and the module never runs.
  test.each(outOfScope)(
    'refuses %s',
    async (_, forged, reached) => {
      const file = forged === 'ABSOLUTE' ? server.file(reached) : forged
      expect(await call(naming(file))).toBe('refused')
      expect(await call(naming(reached))).toBe('refused')
      const name = /MARK_(\w+)/.exec(await server.read(reached))![1]
      expect(ran()).not.toContain(name)
    },
    timeout,
  )

  test(
    'a package fn answers once the client compiled its module in the session',
    async () => {
      const id = naming('node_modules/lib-pkg/fns.js')
      expect(await call(id)).toBe('refused')
      expect(await clientId('/node_modules/lib-pkg/fns.js')).toBe(id)
      expect(await call(id)).toBe('MARK_LIB')
    },
    timeout,
  )

  // Last: it restarts the server. A page left open across the restart calls
  // the id it holds; the new server has compiled nothing.
  test(
    'an app fn id from before a restart answers on the new server',
    async () => {
      await server.vite.restart()
      expect(await call(appId)).toBe('MARK_APP')
    },
    timeout,
  )
})

/**
 * Rsbuild's dev resolver is a manifest of the server fns its compiles
 * registered (`manifestResolverModule`): no id is compiled on request, so
 * every id above is refused there, also one naming a file in src that
 * nothing imports.
 */
describe('rsbuild dev: by-id requests', () => {
  let server: RsbuildDevServer
  const naming = (file: string) => encode({ f: file, k: 'internal' })
  const call = (id: string) =>
    callAt(server.url!, id, 'Server function info not found')

  const openServer = closeAfterAll()
  beforeAll(async () => {
    const { 'harness/server-entry.ts': _, ...appFiles } = files
    server = await openServer(() =>
      startRsbuildStartDevServerShared({
        browser: true,
        config: { plugins: [pluginReact()] },
        files: { ...appFiles, 'src/entry.ts': `import './fns'\n` },
        symlinks,
      }),
    )
  }, timeout)

  test(
    'the app fn the client compiled answers (control)',
    async () => {
      expect(await call(naming('src/fns.ts'))).toBe('MARK_APP')
    },
    timeout,
  )

  test.each([
    ['a file in src that nothing imports', 'src/other.ts', 'src/other.ts'],
    ...outOfScope,
  ])(
    'refuses %s',
    async (_, forged, reached) => {
      const file =
        forged === 'ABSOLUTE' ? path.join(server.root, reached) : forged
      expect(await call(naming(file))).toBe('refused')
      expect(await call(naming(reached))).toBe('refused')
    },
    timeout,
  )
})
