/**
 * An import moved into a split chunk keeps its attributes (SPEC J2.16,
 * J2.17): the bundler that compiles the chunk still applies them.
 * Vite gives an import attribute no meaning (its dev server and build drop
 * them), so this is judged with webpack, which honours `type: 'json'`: a
 * `.txt` file holding JSON loads as JSON only through the attribute (without
 * it, the build fails parsing the file as JavaScript). The deprecated
 * `assert` form keeps working too. Fast-tier counterpart (the moved import
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
      env: 'ssr',
      minify: false,
      files: routeApp(
        `${head}import data from '../data.txt' ${attribute}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{data.title}</p>,
})
`,
        { files: { 'data.txt': '{ "title": "from json" }' } },
      ),
    })
    try {
      expect(
        (
          await app.run(
            `return [entry.Route.options.loader(), await entry.render(entry.Route.options.component)]`,
          )
        ).result,
      ).toEqual(['data', '<p>from json</p>'])
    } finally {
      await app.dispose()
    }
  })
})
