/**
 * Build-level source map of a client module whose server fn became an RPC
 * stub (SPEC G6): a component of that module throws at a known line, the
 * real production build (Start's Vite and Rsbuild plugins, build-harness.ts)
 * emits maps, and the thrown error's stack frame, read through the chunk's
 * map with the standard consumer (`@tanstack/compiler-test-utils/
 * source-maps`), resolves to the user's file, the line of the throw and a
 * column inside the throw statement. Also with a map-producing transform
 * before Start (Oxc lowering the module's syntax, as a user plugin would):
 * the maps compose. Minified builds (the production default).
 * Source: FIX-PLAN V2-24 (start-fable SF-31).
 */
import path from 'node:path'
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { mentionsFile } from '@tanstack/compiler-test-utils/diagnostics'
import {
  findNodes,
  positionAt,
  traceStack,
} from '@tanstack/compiler-test-utils/source-maps'
import { buildStart, startBundlers } from '../build-harness'
import type { StartBuild, StartBundler } from '../build-harness'
import type { RsbuildPlugin } from '@rsbuild/core'
import type { Plugin } from 'vite'

const timeout = 60_000

/**
 * A client module with a server fn (an RPC stub in the client) and a
 * component throwing at a known line; the throw line uses syntax the
 * pre-transform lowers (`?.`, `??`).
 */
const fail = `import { createServerFn } from '@tanstack/react-start'
import { secret } from './secret'
export const getSecret = createServerFn().handler(async () => secret())
export function Page(props: { label?: { prefix: string } }): never {
  const label = props.label
  throw new Error((label?.prefix ?? 'MARK') + '_PAGE_THROW')
}
`
const files = {
  'src/fail.tsx': fail,
  'src/secret.ts': `export const secret = () => 'MARK_SECRET'\n`,
  'src/entry.ts': `export { getSecret, Page } from './fail'\n`,
}

/** The throw statement of the fixture: its line and column span (0-based). */
const throwStatement = (() => {
  const [node] = findNodes(
    fail,
    (candidate) => candidate.type === 'ThrowStatement',
    {
      filename: 'fail.tsx',
    },
  )
  const start = positionAt(fail, node!.start)
  const end = positionAt(fail, node!.end)
  expect(end.line).toBe(start.line)
  return { line: start.line, from: start.column, to: end.column }
})()

/**
 * Whether the transform before Start saw the module as the user wrote it
 * (its server-only import still there): a precondition of the composed-map
 * row, not an assertion on Start.
 */
let preTransformSawSource = false

/** Lowers `src/fail.tsx` with Oxc (a map-producing transform) before Start. */
async function lower(code: string, id: string) {
  preTransformSawSource ||= code.includes(`from './secret'`)
  const result = await transformWithOxc(code, id, {
    lang: 'tsx',
    target: 'es2019',
    sourcemap: true,
  })
  return { code: result.code, map: result.map }
}

const isFail = (id: string) => id.replace(/\?.*$/, '').endsWith('/src/fail.tsx')

const vitePreTransform: Plugin = {
  name: 'test-lower-before-start',
  transform: {
    order: 'pre',
    handler: (code, id) => (isFail(id) ? lower(code, id) : undefined),
  },
}

const rsbuildPreTransform: RsbuildPlugin = {
  name: 'test-lower-before-start',
  setup(api) {
    api.transform(
      { test: /[\\/]src[\\/]fail\.tsx$/, order: 'pre' },
      async (ctx) => {
        const { code, map } = await lower(ctx.code, ctx.resourcePath)
        // Rsbuild takes a map as JSON text or Rspack's own object.
        return { code, map: map ? JSON.stringify(map) : null }
      },
    )
  },
}

/**
 * Builds the app (minified, with maps) and returns the frames of the throw
 * in the client, resolved through the emitted maps.
 */
async function throwFrames(
  bundler: StartBundler,
  options: { preTransform: boolean },
) {
  const { client } = await buildStart({
    bundler,
    files,
    entry: 'src/entry.ts',
    sourcemap: true,
    ...(options.preTransform &&
      (bundler === 'vite'
        ? { viteConfig: { plugins: [vitePreTransform] } }
        : { rsbuildConfig: { plugins: [rsbuildPreTransform] } })),
  })
  expect(client.where('MARK_SECRET')).toBe('nowhere')
  const { result: stack } = await client.run(
    `try { entry.Page({}) } catch (error) { return error.stack }`,
  )
  expect(stack).toMatch(/MARK_PAGE_THROW/)
  return {
    client,
    frames: traceStack(stack as string, (location) =>
      chunkMap(client, location),
    ),
  }
}

/** The map of the chunk a page served at `location`, if it is one. */
function chunkMap(client: StartBuild['client'], location: string) {
  if (!/^https?:/.test(location)) {
    return undefined
  }
  const file = path.join(
    client.outDir,
    decodeURIComponent(new URL(location).pathname),
  )
  const chunk = client.chunks.find(
    (candidate) => path.join(client.outDir, candidate.fileName) === file,
  )
  if (chunk && !chunk.map) {
    throw new Error(`${chunk.fileName} has no source map`)
  }
  return chunk?.map
}

/** The innermost frame that resolves to the user's module. */
function expectThrowFrame(frames: ReturnType<typeof traceStack>, root: string) {
  const resolved = frames.filter((frame) => frame.original)
  expect(resolved.length, 'frames with a mapping').toBeGreaterThan(0)
  const frame = resolved[0]!.original!
  expect(
    mentionsFile(frame.source, 'src/fail.tsx', { root }),
    `${frame.source} names src/fail.tsx`,
  ).toBe(true)
  expect(frame.line).toBe(throwStatement.line)
  expect(frame.column).toBeGreaterThanOrEqual(throwStatement.from)
  expect(frame.column).toBeLessThanOrEqual(throwStatement.to)
}

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    "client: a throw in the component of a server fn module maps to the user's file, line and throw statement (minified)",
    async () => {
      const { client, frames } = await throwFrames(bundler, {
        preTransform: false,
      })
      expectThrowFrame(frames, client.root)
    },
    timeout,
  )

  test(
    'client: the same, through a map-producing transform that ran before Start',
    async () => {
      preTransformSawSource = false
      const { client, frames } = await throwFrames(bundler, {
        preTransform: true,
      })
      expect(preTransformSawSource, 'the transform ran before Start').toBe(true)
      expectThrowFrame(frames, client.root)
    },
    timeout,
  )
})
