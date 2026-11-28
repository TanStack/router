/**
 * Statements next to the declarations Start generates, in real builds through Start's
 * Vite and Rsbuild plugins (build-harness.ts; split from
 * start-build-options.test.ts to keep each file within the per-file time
 * limit).
 */
import { describe, expect, test } from 'vitest'
import {
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import { buildStart } from '../build-start'
import { routeFiles } from './start-build-route-app'

const timeout = 60_000

describe.each(startBundlers)('%s build', (bundler) => {
  // A generated declaration (here the server fn hoisted immediately above
  // the statement holding it, R162), or the statement rendered before the
  // one the source wrote there, must not take the next statement for its
  // call.
  test.each([
    {
      shape: 'a license comment between it and the generated declaration',
      statements: `const mw = createMiddleware().server(({ next }) => next());
(globalThis).marker = 'MARK_STATEMENT';
/*! license */`,
    },
    {
      shape: 'an isomorphic call the server rewrites',
      statements: `const mw = createMiddleware().server(({ next }) => next());
createIsomorphicFn().server(() => { globalThis.marker = 'MARK_STATEMENT' })();`,
    },
    {
      shape: 'an isomorphic call after an import that goes',
      statements: `globalThis.before = 1 // a comment;
import { createFileRoute } from '@tanstack/react-router';
createIsomorphicFn().server(() => { globalThis.marker = 'MARK_STATEMENT' })();
const mw = createMiddleware().server(({ next }) => next());`,
    },
  ])(
    'a statement starting with a parenthesis stays a statement after $shape',
    async ({ statements }) => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          ...routeFiles,
          'src/routes/index.tsx': `${statements.includes('@tanstack/react-router') ? '' : `import { createFileRoute } from '@tanstack/react-router'\n`}import {
  createIsomorphicFn,
  createMiddleware,
  createServerFn,
} from '@tanstack/react-start'
${statements}
(globalThis as any).greet = createServerFn()
  .middleware([mw])
  .handler(async () => globalThis.marker)
export const load = () => (globalThis as any).greet
export const Route = createFileRoute('/')({
  component: () => 'MARK_COMPONENT',
})
`,
          'src/client-entry.ts': `export { getRouter } from './router'
export { load } from './routes/index'
`,
          'src/ssr-entry.ts': `export { getRouter } from './router'
export { load } from './routes/index'
${callByIdExports}`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      const id = (await client.run(`return entry.load().url`)).result
      expect(
        (
          await ssr.run(
            `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(id)}))`,
          )
        ).result,
      ).toBe('MARK_STATEMENT')
    },
    timeout,
  )

  // A type of a value's name, declared first, gives the value nothing.
  test(
    'a hoisted server fn reads a const a type of its name precedes',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          ...routeFiles,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
export type Check = (data: string) => string
export const Check: Check = (data) => data
export const fns = {
  load: createServerFn()
    .validator(Check)
    .handler(async () => 'MARK_FN'),
}
export const Route = createFileRoute('/')({
  component: () => 'MARK_COMPONENT',
})
`,
          'src/client-entry.ts': `export { getRouter } from './router'
export { fns } from './routes/index'
`,
          'src/ssr-entry.ts': `export { getRouter } from './router'
export { fns } from './routes/index'
${callByIdExports}`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      const id = (await client.run(`return entry.fns.load.url`)).result
      expect(
        (
          await ssr.run(
            `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(id)}), 'x')`,
          )
        ).result,
      ).toBe('MARK_FN')
    },
    timeout,
  )

  // Generated declarations render above the file's first statement on the
  // server; a statement starting with a parenthesis must not become a call of
  // the last of them.
  test(
    'a route file whose first statement starts with a parenthesis stays a statement of its own',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          ...routeFiles,
          'src/routes/index.tsx': `;(globalThis).parenStatement = 'MARK_PAREN'
export const greet = createServerFn().handler(async () => 'MARK_FN')
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
export const Route = createFileRoute('/')({ component: () => 'MARK_COMPONENT' })
`.slice(1),
          'src/client-entry.ts': `export { getRouter } from './router'\n`,
          'src/ssr-entry.ts': `export { getRouter } from './router'
export { greet } from './routes/index'
`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      expect((await ssr.run(`return globalThis.parenStatement`)).result).toBe(
        'MARK_PAREN',
      )
    },
    timeout,
  )
})
