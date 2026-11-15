/**
 * The client puts a server function's id in its URL unencoded, as one path
 * segment, and the server reads that segment back. An id a custom
 * `serverFns.generateFunctionId` returns with an ASCII character outside
 * RFC 3986's unreserved set and `$` (`'`, `:`, `%`…) reaches its handler,
 * but proxies and servers may encode or normalise it: it builds, with a
 * deprecation warning naming the file. An id of unreserved characters and
 * `$` builds without one. (Ids that never reached their handler fail the
 * build: `tests/createServerFn/createServerFn.test.ts`.)
 */
import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, test } from 'vitest'
import { appFiles, buildStartApp, createStartApp } from './start-app'

const timeout = 60_000

const execFileAsync = promisify(execFile)

/** Ids that reach their handler, deprecated, by file. */
const deprecated: Record<string, string> = {
  'src/fns/apostrophe.ts': "users'get",
  'src/fns/colon.ts': 'users:get',
  'src/fns/percent.ts': 'users%2Fget',
  'src/fns/brackets.ts': 'users[get]',
}

const fine: Record<string, string> = { 'src/fns/fine.ts': 'Users-get.v1_~$' }

const ids = { ...deprecated, ...fine }

/** A route whose component references a server function of each file, which returns the file's name. */
function app() {
  const files: Record<string, string> = {}
  const imports: Array<string> = []
  Object.keys(ids).forEach((file, index) => {
    files[file] = `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => new Response(${JSON.stringify(file)}))
`
    imports.push(
      `import { fn as fn${index} } from '${file.replace(/^src\/(.*)\.ts$/, '../$1')}'`,
    )
  })
  files['src/routes/index.tsx'] =
    `import { createFileRoute } from '@tanstack/react-router'
${imports.join('\n')}
export const Route = createFileRoute('/')({
  component: () => <button onClick={() => [${Object.keys(ids).map((_, index) => `fn${index}()`)}]}>call</button>,
})
`
  return appFiles(files)
}

/**
 * Sends a request for each id (`/_serverFn/<id>`, as a page of the same
 * origin does) to the server build's entry, in a Node process of its own,
 * and gives each response's text.
 */
async function callServer(root: string, ids: Array<string>) {
  const dir = path.join(root, 'dist/server')
  const entry = (await readdir(dir)).find((file) =>
    /^(server|index)\.m?js$/.test(file),
  )
  if (entry === undefined) {
    throw new Error(`no server entry in ${dir}`)
  }
  const script = `const { default: server } = await import(${JSON.stringify(pathToFileURL(path.join(dir, entry)).href)})
const texts = []
for (const id of ${JSON.stringify(ids)}) {
  const response = await server.fetch(
    new Request(new URL('/_serverFn/' + id, 'http://localhost'), {
      headers: { 'sec-fetch-site': 'same-origin' },
    }),
  )
  texts.push(await response.text())
}
process.stdout.write(JSON.stringify(texts))
`
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { cwd: root, env: { ...process.env, NODE_ENV: 'production' } },
  )
  return JSON.parse(stdout) as Array<string>
}

const options = {
  serverFns: {
    generateFunctionId: ({ filename }: { filename: string }) => ids[filename],
  },
}

describe.each(['vite', 'rsbuild'] as const)('%s build', (bundler) => {
  // `'` broke the server bundle: the resolver's manifest key was quoted with it
  test(
    'a custom id with characters outside the unreserved set builds and reaches its handler',
    async () => {
      const start = await createStartApp(app())
      await buildStartApp(start, bundler, options)
      expect(await callServer(start.root, Object.values(ids))).toEqual(
        Object.keys(ids),
      )
    },
    timeout,
  )
})

// (Rsbuild's transform context has no channel for the compiler's warnings)
describe('vite build', () => {
  test(
    'a custom id with characters outside the unreserved set warns, naming the file and the id',
    async () => {
      const start = await createStartApp(app())
      const build = await buildStartApp(start, 'vite', options)
      for (const [file, id] of Object.entries(ids)) {
        expect(
          build.warnings.some(
            (warning) =>
              warning.includes(file) && warning.includes(JSON.stringify(id)),
          ),
          `a warning naming ${file}`,
        ).toBe(file in deprecated)
      }
    },
    timeout,
  )
})
