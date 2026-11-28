/**
 * An Rsbuild production build (no RSC) whose server compiler has a module
 * rule of the user's putting `.mjs` files in a layer: import protection's
 * edge modules are `.mjs` virtual files, so the rule puts them in that
 * layer, not in their importer's. A live denied import must still fail the
 * build with `behavior: 'error'`: an edge module belongs to the compile
 * environment its importer's compile made it for, whatever layer holds it.
 * Source: the RSC phase 1 review (/var/tmp/rsc-p1-review/astra/report.md
 * Part A §1: 55c11d81b8 built it with no report; 88dded8da0 and main
 * failed it).
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { rejection } from '../../importProtection/start-apps'

const timeout = 60_000

describe('Rsbuild build, a user rule putting .mjs files in a layer', () => {
  test.each([
    { name: 'no such rule', rules: [] },
    { name: 'the rule', rules: [{ test: /\.mjs$/, layer: 'libraries' }] },
  ])(
    'with $name, a live denied import fails the build and is reported in ssr',
    async ({ rules }) => {
      const reported: Array<string> = []
      const failed = await rejection(
        buildStart({
          bundler: 'rsbuild',
          entry: { client: 'src/client.ts', ssr: 'src/server.ts' },
          files: {
            'src/client.ts': `export const client = 1\n`,
            'src/server.ts': `export { read } from './feature'\n`,
            'src/feature.ts': `import { denied } from './private.client'
export function read() {
  return denied()
}
`,
            'src/private.client.ts': `export const denied = () => 'DENIED'\n`,
          },
          rsbuildConfig: {
            environments: { ssr: { tools: { rspack: { module: { rules } } } } },
          },
          start: {
            importProtection: {
              behavior: 'error',
              onViolation: (info: { env: string; specifier: string }) => {
                reported.push(`${info.env} ${info.specifier}`)
              },
            },
          } as never,
        }),
      )
      expect(failed).toBeInstanceOf(Error)
      expect([...new Set(reported)]).toEqual(['ssr ./private.client'])
    },
    timeout,
  )
})
