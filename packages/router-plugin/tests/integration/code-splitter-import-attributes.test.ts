/**
 * An import moved into a split chunk keeps its attributes (SPEC J2.16,
 * J2.17): the bundler that compiles the chunk still applies them.
 * Vite gives an import attribute no meaning (its dev server and build drop
 * them), so this is judged with webpack, which honours `type: 'json'`: a
 * `.txt` file holding JSON loads as JSON only through the attribute (without
 * it, the build fails parsing the file as JavaScript). The deprecated
 * `assert` form keeps working too. A client build: the import is in the
 * component's chunk, which loads on demand. Fast-tier counterpart (the moved import
 * keeps working in Vite): tests/code-splitter-imports-exports.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { build, routeApp } from '../build-harness'
import { head } from '../route-app'

describe('the attribute of an import moved into the chunk still applies (webpack)', () => {
  it.each([
    { name: 'an import attribute', attribute: `with { type: 'json' }` },
    { name: 'an import assertion', attribute: `assert { type: 'json' }` },
  ])('$name', async ({ attribute }) => {
    const app = await build({
      bundler: 'webpack',
      env: 'client',
      minify: false,
      files: routeApp(
        `${head}import data from '../data.txt' ${attribute}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{data.title}</p>,
})
`,
        { env: 'client', files: { 'data.txt': '{ "title": "MARK_JSON" }' } },
      ),
    })
    try {
      const run = await app.run(
        `await entry.mount(entry.Route.options.component)\nreturn entry.Route.options.loader()`,
      )
      expect(run.result).toBe('data')
      expect(run.html).toContain('<p>MARK_JSON</p>')
      // the import moved: the data loads with the component's chunk
      expect(app.where('MARK_JSON')).toBe('lazy')
    } finally {
      await app.dispose()
    }
  })
})
