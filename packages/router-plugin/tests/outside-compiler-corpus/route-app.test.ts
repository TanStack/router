/**
 * Controls for the route app (`../route-app.ts`): its observers (requests,
 * laziness, groups), its renderers, its shared hosts and its diagnostics,
 * on inputs where the outcome does not depend on how a compiler splits:
 * lazy values written by hand with the router's public API, under
 * `autoCodeSplitting: false`.
 *
 * Harness controls, outside the compiler test corpus (see
 * packages/compiler-test-utils/AGENTS.md): they check the test helper, not
 * the compiler. `test:implementation` runs them.
 */
import { describe, expect, it } from 'vitest'
import {
  captureThrow,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  expectValidModules,
  head,
  holdsMarker,
  loadRoute,
  stringValues,
} from '../route-app'
import type { Plugin } from 'vite'

/** No splitting by the compiler: what is lazy is what the route file makes lazy. */
const manual = { pluginOptions: { autoCodeSplitting: false } }

const handWrittenLazy = `import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { eager } from './eager'
export const Route = createFileRoute('/')({
  loader: () => eager,
  component: lazyRouteComponent(() => import('./page'), 'Page'),
  errorComponent: lazyRouteComponent(() => import('./page'), 'ErrorView'),
  pendingComponent: () => <i>pending</i>,
})
`

const handWrittenFiles = {
  'eager.ts': `export const eager = 'MARK_EAGER'\n`,
  'page.tsx': `export const Page = () => <p>MARK_PAGE</p>
export const ErrorView = () => <p>MARK_ERROR</p>
`,
}

/**
 * The hand-written lazy route, its lazy module served by a plugin (a module
 * no file of the test holds: what the observers count as emitted for the
 * route, as a compiler's chunk would be).
 */
const loadVirtualLazy = () =>
  loadRoute(handWrittenLazy.replaceAll('./page', 'virtual:page'), {
    ...manual,
    plugins: {
      before: [
        {
          name: 'control:virtual-page',
          resolveId: (id) =>
            id === 'virtual:page' ? '\0virtual:page.tsx' : null,
          load: (id) =>
            id === '\0virtual:page.tsx'
              ? `import { jsx } from 'react/jsx-runtime'
export const Page = () => jsx('p', { children: 'MARK_PAGE' })
export const ErrorView = () => jsx('p', { children: 'MARK_ERROR' })
`
              : null,
        } satisfies Plugin,
      ],
    },
    files: { 'eager.ts': handWrittenFiles['eager.ts'] },
  })

describe('observers on a route that is lazy by hand', () => {
  it('a component the route loads lazily is lazy; an inline one and the loader are not', async () => {
    const route = await loadVirtualLazy()
    expect(await route.isLazy('component')).toBe(true)
    expect(await route.isLazy('errorComponent')).toBe(true)
    expect(await route.isLazy('pendingComponent')).toBe(false)
    expect(await route.isLazy('loader')).toBe(false)
  })

  it('requests of the route load hold the files it imports statically, not the lazy one', async () => {
    const route = await loadRoute(handWrittenLazy, {
      ...manual,
      files: handWrittenFiles,
    })
    const requested = await route.requested()
    expect(requested).toContain('/eager.ts')
    expect(requested).toContain('/route.tsx')
    expect(requested).not.toContain('/page.tsx')
  })

  it("a test's own file loaded lazily is not a compiled module: loadedBy fails for it", async () => {
    const route = await loadRoute(handWrittenLazy, {
      ...manual,
      files: handWrittenFiles,
    })
    // `page.tsx` is the test's file: only modules the compilers emitted count
    await expect(route.loadedBy('component')).rejects.toThrow(
      /loads no module of the route lazily/,
    )
  })

  it('groups: two options loading one module are one group', async () => {
    const route = await loadVirtualLazy()
    expect(await route.groups()).toEqual([['component', 'errorComponent']])
    const loaded = await route.loadedBy('component')
    expect(loaded.some((code) => holdsMarker(code, 'MARK_PAGE'))).toBe(true)
  })
})

describe('renderers', () => {
  it('render: the client DOM of a component, after its preload', async () => {
    const route = await loadRoute(handWrittenLazy, {
      ...manual,
      files: handWrittenFiles,
    })
    expect(
      await route.run(
        `return [await render('component'), await render('pendingComponent'), await options.loader()]`,
      ),
    ).toEqual(['<p>MARK_PAGE</p>', '<i>pending</i>', 'MARK_EAGER'])
  })

  it('renderRoute: the generated route tree and the real router, with loader data and params', async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/posts/$id')({
  loader: ({ params }) => 'post ' + params.id,
  component: () => <p>{Route.useLoaderData()}</p>,
})
`,
      { routeId: '/posts/$id' },
    )
    expect(await route.run(`return renderRoute({ at: '/posts/7' })`)).toContain(
      '<p>post 7</p>',
    )
  })
})

describe('shared hosts', () => {
  it('a route whose host moved on to another route writes its files back before its next run', async () => {
    const first = await loadRoute(
      `${head}import { label } from './label'
export const Route = createFileRoute('/')({ loader: () => label })
`,
      { files: { 'label.ts': `export const label = 'first'\n` } },
    )
    const second = await loadRoute(
      `${head}export const Route = createFileRoute('/')({ loader: () => 'second' })
`,
    )
    expect(await second.run('return options.loader()')).toBe('second')
    expect(await first.run('return options.loader()')).toBe('first')
    expect(await second.run('return options.loader()')).toBe('second')
  })

  it('an edit that deletes a module the page loaded does not reload the next run', async () => {
    // Vite keeps the full reload of the deletion for the next client; the
    // route app keeps a client connected, so the next page run is not
    // reloaded under it.
    for (let round = 0; round < 3; round++) {
      const route = await loadRoute(
        `${head}import { value } from './value-${round}'
export const Route = createFileRoute('/')({ loader: () => value })
`,
        { files: { [`value-${round}.ts`]: `export const value = ${round}\n` } },
      )
      expect(await route.run('return options.loader()')).toBe(round)
    }
  })
})

describe('diagnostics and compile errors', () => {
  it("a plugin's warning is in the route's merged channel", async () => {
    const route = await loadRoute(
      `${head}export const Route = createFileRoute('/')({ loader: () => 1 })
`,
      {
        plugins: {
          after: [
            {
              name: 'control:warns',
              transform(code, id) {
                if (id.endsWith('/route.tsx')) {
                  this.warn('control warning about route.tsx')
                }
                return null
              },
            } satisfies Plugin,
          ],
        },
      },
    )
    await expectValidModules(route)
    expect(
      findDiagnostics(await route.diagnostics(), {
        severity: 'warning',
        file: 'route.tsx',
        root: route.host.root,
      }).length,
    ).toBeGreaterThan(0)
  })

  it('transform rejects with the error a syntax error gives, with its position', async () => {
    const code = `${head}export const Route = createFileRoute('/')({})
export const broken = ;
`
    const route = await loadRoute(code)
    const thrown = await captureThrow(() => route.transform())
    expect(
      findDiagnostics([...thrown, ...(await route.diagnostics())], {
        severity: 'error',
        position: { line: 3, column: 23 },
        source: code,
      }).length,
    ).toBeGreaterThan(0)
  })
})

describe('stringValues', () => {
  it('decodes string literals, template quasis and JSX text whatever the quoting', () => {
    const values = stringValues(
      `const a = 'MARK\\u005fA'; const b = \`MARK_\${x}B\`; const c = <p>MARK_C</p>`,
      'module.tsx',
    )
    expect(values.has('MARK_A')).toBe(true)
    expect([...values].some((value) => value.includes('MARK_C'))).toBe(true)
    expect(holdsMarker('const b = `MARK_${x}B`', 'MARK_')).toBe(true)
  })
})
