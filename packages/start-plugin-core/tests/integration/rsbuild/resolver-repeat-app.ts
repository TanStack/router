/**
 * An RSC app whose server function resolver cannot settle: the page calls
 * `fn1` of `fn0.ts`, a server fn whose handler calls `fn1` of `fn1.ts`, a
 * server fn of the same name; a loader of the app's (`once.cjs`, before
 * Start's) gives `fn1.ts` as written on its first load and a plain function
 * on every later one (the server fn's provider module): the resolver goes
 * back to the functions it listed before. The function that differs is
 * `fn1` of `fn1.ts`.
 * Source: the RSC phase 1 re-check 4 (/var/tmp/rsc-p1-recheck4/report.md §3,
 * `resolver-duplicate.py`).
 */
import path from 'node:path'

/** The app's files (over the RSC app's root route and router). */
export const resolverRepeatFiles = {
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { fn1 } from '../fn0'
export const Route = createFileRoute('/')({
  loader: async () => ({ value: await fn1() }),
  component: Home,
})
function Home() {
  return <main data-testid="value">{Route.useLoaderData().value}</main>
}
`,
  'src/fn0.ts': `import { createServerFn } from '@tanstack/react-start'
import { fn1 as next } from './fn1'
export const fn1 = createServerFn().handler(() => next())
`,
  'src/fn1.ts': `import { createServerFn } from '@tanstack/react-start'
export const fn1 = createServerFn().handler(() => 'DEEP_VALUE')
`,
  'once.cjs': `let loads = 0
module.exports = function (source) {
  this.cacheable(false)
  return ++loads === 1 ? source : "export const fn1 = () => 'PLAIN'\\n"
}
`,
}

/** Rsbuild's `tools.rspack` of the app: `once.cjs` before Start's loader on the server's `fn1.ts`. */
export function resolverRepeatRspack(
  config: { context?: string; module: { rules?: Array<unknown> } },
  { environment }: { environment: { name: string } },
): void {
  if (environment.name === 'ssr') {
    ;(config.module.rules ??= []).push({
      enforce: 'pre',
      test: /fn1\.ts$/,
      use: [path.join(config.context!, 'once.cjs')],
    })
  }
}
