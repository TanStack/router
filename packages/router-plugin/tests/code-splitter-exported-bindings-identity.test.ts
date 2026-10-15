import { describe, expect, it } from 'vitest'
import { buildAndRun, head } from './regression-helpers'

/**
 * An entry that imports `Route` and, like another module of the app, `imports`
 * (comma separated) from the route file, then runs `setup` before any split
 * chunk loads.
 */
function entryImporting(imports: string, setup: string) {
  return `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Route, ${imports} } from './routes/index'
export { Route }
${setup}
export async function render(component: any) {
  await component.preload?.()
  return renderToString(createElement(component))
}
`
}

const render = `return entry.render(entry.Route.options.component)`

describe('a split option and other importers of the route file share its exports', () => {
  it('an instance of an exported class that another module creates is an instance of the class the split component reads', async () => {
    const html = await buildAndRun(
      `${head}export class Store {}
function Page() {
  return <p>{String((globalThis as any).__store instanceof Store)}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      render,
      {
        files: {
          'entry.ts': entryImporting(
            'Store',
            ';(globalThis as any).__store = new Store()',
          ),
        },
      },
    )
    expect(html).toBe('<p>true</p>')
  }, 30_000)

  it('an exported function over module state keeps one state for the split component and other modules', async () => {
    const html = await buildAndRun(
      `${head}let count = 0
export function next() {
  return ++count
}
function Page() {
  return <p>{next()}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      render,
      { files: { 'entry.ts': entryImporting('next', 'next()') } },
    )
    // The entry's call is the first, the split component's the second
    expect(html).toBe('<p>2</p>')
  }, 30_000)

  // The module that holds the state then has a top-level call, so the bundler
  // has to keep it where it is imported
  it('an exported function over state an imported call creates initializes and keeps it once', async () => {
    const result = await buildAndRun(
      `${head}import { init } from '../state'
const state = init({ count: 0 })
export function increment() {
  return ++state.count
}
function Page() {
  return <p>{increment()}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      `return [await entry.render(entry.Route.options.component), globalThis.__inits]`,
      {
        files: {
          'entry.ts': entryImporting('increment', 'increment()'),
          'state.ts': `export function init<T>(value: T) {
  ;(globalThis as any).__inits = ((globalThis as any).__inits ?? 0) + 1
  return value
}
`,
        },
      },
    )
    expect(result).toEqual(['<p>2</p>', 1])
  }, 30_000)

  it('an exported function over state the route file configures first sees the configured state', async () => {
    const html = await buildAndRun(
      `${head}import { configure, createStore } from '../store'
configure(5)
const store = createStore()
export function useCount() {
  return store.count
}
function Page() {
  return <p>{useCount()}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      render,
      {
        files: {
          'store.ts': `let initial = 0
export function configure(count: number) {
  initial = count
}
export function createStore() {
  return { count: initial }
}
`,
        },
      },
    )
    expect(html).toBe('<p>5</p>')
  }, 30_000)

  // Main copied an exported function into the chunk, so the split component
  // rendered another function than the one other modules import.
  it('an exported function component is the one other modules import', async () => {
    const html = await buildAndRun(
      `${head}export function Card() {
  return <b>card</b>
}
function Page() {
  return <p>{String((globalThis as any).__Card === Card)}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      render,
      {
        files: {
          'entry.ts': entryImporting(
            'Card',
            ';(globalThis as any).__Card = Card',
          ),
        },
      },
    )
    expect(html).toBe('<p>true</p>')
  }, 30_000)

  it('an exported function component and the private state it reads are the ones other modules import', async () => {
    const html = await buildAndRun(
      `${head}const registry = new Set<string>()
function size() {
  return registry.size
}
export function Card({ id }: { id: string }) {
  registry.add(id)
  return <b>{size()}</b>
}
function Page() {
  return (
    <p>
      {String((globalThis as any).__Card === Card)}
      <Card id="page" />
    </p>
  )
}
export const Route = createFileRoute('/')({ component: Page })
`,
      render,
      {
        files: {
          'entry.ts': entryImporting(
            'Card',
            ";(globalThis as any).__Card = Card\nCard({ id: 'entry' })",
          ),
        },
      },
    )
    expect(html).toBe('<p>true<b>2</b></p>')
  }, 30_000)
})
