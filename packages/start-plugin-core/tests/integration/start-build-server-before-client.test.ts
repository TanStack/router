/**
 * A Vite build whose server environment builds before the client's, or
 * without it (an app plugin's `buildApp` that builds the server first, a
 * hand-written `createBuilder().build(ssr)`, client and server built in two
 * steps): the server's manifest of HTTP-callable server fns lists what the
 * client build references, which this server build cannot know. The build
 * fails instead of producing a server that answers no client call.
 */
import { expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import {
  StartBuildError,
  buildStart,
  callByIdExports,
  callByIdPrelude,
} from '../build-harness'
import type { Plugin } from 'vite'

const timeout = 60_000

/** An app plugin building the server environment first. */
const serverFirst: Plugin = {
  name: 'app:server-first',
  async buildApp(builder) {
    await builder.build(builder.environments.ssr!)
  },
}

test(
  'a Vite build of the server environment before the client fails',
  async () => {
    const outcome = await buildStart({
      files: {
        'fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_GREETING')
`,
        'client-entry.ts': `export { greet } from './fns'\n`,
        'ssr-entry.ts': `export { greet } from './fns'\n${callByIdExports}`,
      },
      entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      viteConfig: { plugins: [serverFirst] },
    }).then(
      async (build) => {
        const url = (await build.client.run(`return entry.greet.url`)).result
        const call = await build.ssr
          .run(
            `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
          )
          .then(
            ({ result }) => result,
            (error: unknown) => String(error),
          )
        return { built: true as const, call }
      },
      (error: unknown) => {
        if (!(error instanceof StartBuildError)) {
          throw error
        }
        return { built: false as const, diagnostics: error.diagnostics }
      },
    )
    if (outcome.built) {
      expect.fail(
        `the build succeeded; a client call of the server fn gives ${JSON.stringify(outcome.call)}`,
      )
    }
    expectDiagnostic(outcome.diagnostics, { severity: 'error' })
  },
  timeout,
)
