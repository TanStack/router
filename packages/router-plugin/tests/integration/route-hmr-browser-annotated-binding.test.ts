/**
 * React route HMR renames a lowercase component binding so React Refresh
 * registers it. A type annotation on the declaration (`const comp: FC`) stays
 * with the renamed name, whatever the declaration form and the option, with
 * splitting on and off: the route renders, an edit updates it in place, and
 * the other routes of the app keep working. Each app holds every form, so one
 * broken route fails the whole app as it would a user's.
 */
import { describe, expect, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import { inPlace } from '../route-hmr-edit'

const declarations = {
  plain: 'const comp',
  const: 'const comp: FC',
  let: 'let comp: FC',
  var: 'var comp: FC',
  export: 'export const comp: FC',
} as const

/** What makes the router show the option: its own route state. */
const options = {
  component: '',
  pendingComponent: 'pendingMs: 0, loader: () => new Promise(() => {}),',
  errorComponent: `loader: () => { throw new Error('expected') },`,
} as const

type Form = keyof typeof declarations
type Option = keyof typeof options

const cells = (Object.keys(declarations) as Array<Form>).flatMap((form) =>
  (Object.keys(options) as Array<Option>).map((option) => ({
    form,
    option,
    path: `/${form}-${option}`,
    file: `routes/${form}-${option}.tsx`,
    shows: (version: string, count: number) =>
      `${form} ${option} ${version} count ${count}`,
  })),
)

const route = (
  { form, option, path }: (typeof cells)[number],
  version: string,
) => `import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { FC } from 'react'
${declarations[form]} = () => {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>${form} ${option} ${version} count {count}</button>
}
export const Route = createFileRoute('${path}')({
  ${options[option]}
  ${option}: comp,
})
`

describe.concurrent('an annotated lowercase component binding', () => {
  describe.for([
    { bundler: 'vite', autoCodeSplitting: true },
    { bundler: 'vite', autoCodeSplitting: false },
    { bundler: 'rsbuild', autoCodeSplitting: true },
    { bundler: 'rsbuild', autoCodeSplitting: false },
  ] as const)('$bundler, splitting $autoCodeSplitting', (host) => {
    test('renders and updates in place', async ({ onTestFinished }) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        bundler: host.bundler,
        pluginOptions: { autoCodeSplitting: host.autoCodeSplitting },
        files: {
          'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>home</p> })
`,
          ...Object.fromEntries(
            cells.map((cell) => [cell.file, route(cell, 'v1')]),
          ),
        },
        ready: 'home',
      })
      for (const cell of cells) {
        await app.evaluate(
          `void window.__APP_ROUTER__.navigate({ to: '${cell.path}' })`,
        )
        await app.page.waitForText(cell.shows('v1', 0), { selector: '#app' })
        await app.click('button')
        await app.page.waitForText(cell.shows('v1', 1), { selector: '#app' })
        // an edit re-runs the route's loader: the error boundary remounts
        // what it shows, annotated or not
        const { reloaded, errors } = await app.edit(
          { [cell.file]: route(cell, 'v2') },
          cell.shows('v2', cell.option === 'errorComponent' ? 0 : 1),
        )
        expect({
          cell: cell.path,
          reloaded,
          errors: errors.filter((error) => !error.includes('expected')),
        }).toEqual({ cell: cell.path, ...inPlace })
      }
    }, 120_000)
  })
})
