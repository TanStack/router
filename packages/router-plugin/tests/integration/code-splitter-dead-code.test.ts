import { describe, expect, it } from 'vitest'
import { build, routeApp } from '../build-harness'
import { head } from '../regression-helpers'

describe('the reference module only drops code that splitting left unused', () => {
  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "only
  // eliminates newly unreferenced identifiers", "unexported circular references"
  // and "SCC with external caller used -> all preserved". Whether unused user
  // code is kept or dropped is free, and unused code may name a binding its
  // module no longer declares (user ruling 2026-10-17, widened: the bundlers
  // delete it; the validator checks what Rolldown's tree-shaking keeps);
  // every module stays valid and the split component still reaches its
  // helper.
  const unusedFunctions = `${head}function helper() { return 'helper' }
function unused() { return 'MARK_UNUSED_END' + helper() }
function ping(): number { return pong() + 'MARK_PING_END'.length }
function pong(): number { return ping() }
export const Route = createFileRoute('/')({ component: () => <p>{helper()}</p> })
`

  // The other half of the ruling: the unused functions (and any binding they
  // name that their module no longer declares) do not reach a production
  // client bundle.
  it.each(['vite', 'rspack', 'webpack'] as const)(
    'drops unused functions, one calling a helper of the split component, from a production client build (%s)',
    async (bundler) => {
      const app = await build({
        bundler,
        env: 'client',
        files: routeApp(unusedFunctions, { env: 'client' }),
      })
      const run = await app.run(
        `await entry.mount(entry.Route.options.component)`,
      )
      expect({
        unused: app.where('MARK_UNUSED_END'),
        ping: app.where('MARK_PING_END'),
        html: run.html,
      }).toEqual({
        unused: 'nowhere',
        ping: 'nowhere',
        html: '<div id="root"><p>helper</p></div>',
      })
    },
    60_000,
  )
})
