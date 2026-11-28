/**
 * An Rsbuild RSC app whose server compiler puts `label.ts` in a layer of the
 * user's (`rsc-environments-app.ts`, a module rule `layer: 'reports'`): the
 * layer is a compile environment of its own, which import protection judges
 * and reports under the compiler's name (`ssr`), and which resolves what
 * Start reads with the compiler's base options (a rule's own `resolve` does
 * not reach the compiler's resolver: the documented limit, Rsbuild guide).
 * - dev on the persistent cache: the layer's denied import is served its
 *   mock on a first start, after a restart with no edit (the restored
 *   importer requests its edge module before any module of the layer
 *   compiled), and after an edit made while stopped;
 * - a build where the layer's rule resolves `#where` with a condition of its
 *   own: Rspack builds that file, and Start judges the import with the
 *   compiler's base resolution.
 * Source: RSC model v2 §5 (G12), user decision 7 (11-20); the restart rows
 * as the phase 1 review found them (Astra's report Part B: 55c11d81b8
 * answered 500 after the restart, `Can't resolve` the edge module).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  environmentsFiles,
  expectPage,
  recorder,
  rendered,
  summary,
} from './rsc-environments-app'
import {
  startRscRsbuildDevServer,
  startRscRsbuildPreviewServer,
} from './rsc-app'

const timeout = 60_000

/** Rsbuild's `tools.rspack` adding `rule` to the server compiler's module rules. */
const serverRule = (rule: Record<string, unknown>) => ({
  rspack: (
    config: { module: { rules?: Array<unknown> } },
    { environment }: { environment: { name: string } },
  ) => {
    if (environment.name === 'ssr') {
      ;(config.module.rules ??= []).push(rule)
    }
  },
})

/**
 * `label.ts` in the user's layer for the route and the server component
 * (two modules: the server component's takes the RSC rules' `resolve`,
 * which reaches `#where`'s `react-server` file), one compile environment.
 */
const mocked = {
  route: '[import-protection mock] MARK_WHERE_PLAIN',
  server: '[import-protection mock] MARK_WHERE_SERVER',
  boxes: 2,
}

test(
  "Rsbuild dev with RSC and a user layer, on the persistent cache: the layer's denied import is served its mock on a first start, after a restart with no edit and after a restart after an edit",
  async () => {
    const { violations, start } = recorder('mock')
    let server = await startRscRsbuildDevServer({
      browser: true,
      start,
      config: {
        performance: { buildCache: true },
        tools: serverRule({ test: /label\.ts$/, layer: 'reports' }),
      },
      files: environmentsFiles,
    })
    const checkpoint =
      "a first start serves the layer's denied import its mock and reports it in ssr"
    await expectPage(server.url!, mocked, checkpoint)
    expect
      .soft(summary(violations), checkpoint)
      .toEqual(['ssr server file label.ts -> ./secret.client'])

    await server.stop()
    server = await server.restart()
    expect(
      server.rebuiltBy.ssr,
      'the cache restored the modules',
    ).not.toContain('src/routes/__root.tsx')
    await expectPage(
      server.url!,
      mocked,
      'a restart with no edit restores the importer, and its edge module resolves',
    )

    await server.stop()
    await writeFile(
      path.join(server.root, 'src/where/plain.ts'),
      `export const where = () => 'MARK_WHERE_EDITED'\n`,
    )
    server = await server.restart()
    await expectPage(
      server.url!,
      {
        ...mocked,
        route: '[import-protection mock] MARK_WHERE_EDITED',
        server: '[import-protection mock] MARK_WHERE_SERVER',
      },
      'a restart after an edit of another file the layer reads shows it',
    )
  },
  3 * timeout,
)

describe('Rsbuild build with RSC and a user layer whose rule resolves with a condition of its own', () => {
  const files = {
    ...environmentsFiles,
    'package.json': JSON.stringify({
      name: 'app',
      private: true,
      type: 'module',
      imports: {
        '#where': {
          reports: './src/where/custom.ts',
          default: './src/where/plain.ts',
        },
      },
    }),
    'src/lib/label.ts': `import { where } from '#where'\nexport const label = () => where()\n`,
    'src/where/custom.ts': `export const where = () => 'MARK_WHERE_CUSTOM'\n`,
  }
  const tools = serverRule({
    test: /label\.ts$/,
    layer: 'reports',
    resolve: { conditionNames: ['reports', '...'] },
  })

  test.for([
    {
      judged: false,
      // Rspack resolves with the layer's rule
      label: 'MARK_WHERE_CUSTOM',
      resolved: [],
    },
    {
      judged: true,
      // the import Start judges is the one the compiler's base options
      // resolve (allowed: its edge module re-exports that file)
      label: 'MARK_WHERE_PLAIN',
      resolved: [expect.stringMatching(/src\/where\/plain\.ts$/)],
    },
  ])(
    'an import Start judges ($judged) renders $label',
    { timeout },
    async ({ judged, label, resolved }) => {
      const { asked, start } = recorder('mock', () => true)
      const server = await startRscRsbuildPreviewServer({
        start: {
          importProtection: {
            ...start.importProtection,
            ...(judged && { server: { specifiers: ['#where'] } }),
          },
        },
        files,
        tools,
      })
      const response = await fetch(new URL('/', server.url))
      expect({
        status: response.status,
        ...rendered(await response.text()),
      }).toEqual({ status: 200, route: label, server: label, boxes: 2 })
      expect(
        asked.map((info) => (info as { resolved?: string }).resolved),
      ).toEqual(resolved)
    },
  )
})
