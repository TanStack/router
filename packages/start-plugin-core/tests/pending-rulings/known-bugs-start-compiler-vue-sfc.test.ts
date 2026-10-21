/**
 * Pending a coordinator decision (workstream B2): the pin needs Vue's real
 * Vite plugin (`@vitejs/plugin-vue`, which serves the `<script lang="ts">`
 * block of an SFC under `Page.vue?vue&type=script&lang.ts`) to reach the
 * compiler through a public host, and that plugin is no dependency of this
 * package (no dependency changes without a coordinator note). Moved
 * unchanged from known-bugs-start-compiler.test.ts:1629-1650; it compiles
 * through the internal `StartCompiler` (the legacy harness), so the
 * import-gate violations of this file are expected until then.
 */
import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  compileFor,
  moduleLoads,
  serverOnlyModule,
} from '../outside-compiler-corpus/legacy/regression-helpers'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/** Server-only module that must never reach the client bundle. */
const serverOnly = serverOnlyModule

describe('Vue single-file components', () => {
  // Bug: the parser is chosen from the module id without its query, so the
  // `<script lang="ts">` block of a Vue SFC, which @vitejs/plugin-vue 6
  // serves in builds as `Page.vue?vue&type=script&lang.ts` (genScriptCode,
  // attrsToQuery), is parsed as TSX. (A `<script setup>` block cannot hold
  // the exported server fn.)
  // Impact: TypeScript-only syntax such as a `<string>value` assertion fails
  // the build.
  test.fails('a <script lang="ts"> block is parsed as TypeScript', async () => {
    const { code, serverFns } = await compileFor(
      'client',
      `${head}import { db } from './db.server'
const input = <string>(globalThis as any).input
export const fn = createServerFn().handler(async () => db.x(input))`,
      { id: '/test/src/Page.vue?vue&type=script&lang.ts' },
    )
    expect(Object.keys(serverFns)).toHaveLength(1)
    expectNotLoaded(await moduleLoads(code!, { id: '/test/src/Page.ts' }), [
      serverOnly,
    ])
  })
})
