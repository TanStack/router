import { describe, expect, it } from 'vitest'
import { buildAndRun, head } from './regression-helpers'

// The generated route tree imports only `Route` from a route file, and it is in
// the entry chunk. This entry does the same, so nothing else uses the route
// file's other exports (tests that import them are not part of the build).
const entry = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route } from './routes/index'
export { Route }
export const entryUrl = import.meta.url
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`

const appPackage = JSON.stringify({
  name: 'app',
  private: true,
  type: 'module',
})

/**
 * Where each marker is built: in the entry chunk or a chunk it statically
 * imports, so that it loads with the entry ('entry'), or only in lazily loaded
 * chunks ('lazy').
 */
const placement = `const fs = await import('node:fs')
const path = await import('node:path')
const url = await import('node:url')
const dir = path.dirname(url.fileURLToPath(entry.entryUrl))
const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8')
const eager = new Set()
const visit = (file) => {
  if (eager.has(file)) return
  eager.add(file)
  for (const [, specifier] of read(file).matchAll(/(?:\\bfrom\\s*|\\bimport\\s*)["']\\.\\/([^"']+)["']/g)) visit(specifier)
}
visit('entry.mjs')
const where = (marker) => [
  ...new Set(
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.mjs') && read(file).includes(marker))
      .map((file) => (eager.has(file) ? 'entry' : 'lazy')),
  ),
]
return {
  html: await entry.render(entry.Route.options.component),
  declaration: where('MARK_DECLARATION'),
  dependency: where('MARK_DEPENDENCY'),
}`

describe('a split option leaves the exports of its route file it uses out of the entry chunk', () => {
  // Route files export page components and helpers so that tests can import
  // them, and only the split component uses them in the app.
  it.each([
    {
      name: 'an exported function component',
      code: `export function Card() {
  return <b>{heavy('MARK_DECLARATION')}</b>
}
function Page() {
  return <Card />
}`,
    },
    {
      name: 'a function component exported by specifier',
      code: `function Card() {
  return <b>{heavy('MARK_DECLARATION')}</b>
}
export { Card }
function Page() {
  return <Card />
}`,
    },
    {
      name: 'a default-exported function component',
      code: `export default function Card() {
  return <b>{heavy('MARK_DECLARATION')}</b>
}
function Page() {
  return <Card />
}`,
    },
    {
      // A client build bundles `react/jsx-runtime`, a CommonJS module, whose
      // interop call has side effects too
      name: 'an exported function component with a dependency that has side effects',
      code: `import { label } from '../label'
export function Card() {
  return <b>{heavy('MARK_DECLARATION ' + label)}</b>
}
function Page() {
  return <Card />
}`,
      // Only the declaration is asserted: how the bundler groups the modules
      // next to a dependency with side effects is up to it
      dependencyIn: expect.anything(),
    },
    {
      name: 'an exported helper function',
      code: `export function format(value: number) {
  return heavy('MARK_DECLARATION ' + value)
}
function Page() {
  return <p>{format(1)}</p>
}`,
    },
    {
      name: 'an exported class',
      code: `export class Store {
  value = heavy('MARK_DECLARATION')
}
function Page() {
  return <p>{new Store().value}</p>
}`,
    },
    {
      name: 'an exported function over module state',
      code: `let count = 0
export function next() {
  count++
  return heavy('MARK_DECLARATION ' + count)
}
function Page() {
  return <p>{next()}</p>
}`,
    },
  ])(
    '$name',
    async ({ code, dependencyIn = ['lazy'] }) => {
      const result = await buildAndRun(
        `${head}import { heavy } from '../heavy'
${code}
export const Route = createFileRoute('/')({ component: Page })
`,
        placement,
        {
          files: {
            'entry.ts': entry,
            // Without it the app inherits the package's `sideEffects: false`
            'package.json': appPackage,
            'heavy.ts': `export function heavy(label: string) {
  return label + ' MARK_DEPENDENCY'
}
`,
            'label.ts': `;(globalThis as any).labelLoaded = true\nexport const label = 'label'\n`,
          },
        },
      )
      expect(result).toEqual({
        html: expect.stringContaining('MARK_DECLARATION'),
        declaration: ['lazy'],
        dependency: dependencyIn,
      })
    },
    30_000,
  )
})
