/**
 * State read or written through another name, real builds (Vite and Rspack
 * client builds, mounted in a DOM). A read through an alias, a holder or a
 * spread reads the object the other name names: it keeps the value the
 * source reads although the write is to the original binding (REVIEW
 * design 2 step 4, finding 1). A call of a method named like an array's
 * mutator (`push`, `set`, `add`) on an object the module defines runs that
 * object's code: it keeps its order with the effects after it (finding 2).
 * A write through another name (an alias, a holder) writes the object that
 * name holds: a read of it through its first name keeps the value the
 * source reads (REVIEW design 2 final, finding 1).
 */
import { describe, expect, test } from 'vitest'
import { build, clientMountEntry, head, routeApp } from '../build-harness'

const timeout = 120_000

const entry = `${clientMountEntry}
export const effects = () => (globalThis as any).__effects
`

async function mounted(
  bundler: 'vite' | 'rspack',
  route: string,
  /** Call `beforeLoad` first, as a navigation does. */
  load = false,
) {
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    files: routeApp(route, {
      env: 'client',
      files: {
        'entry.ts': entry,
        'track.ts': `export function track(name: string) {
  ;((globalThis as any).__effects ??= []).push(name)
}
`,
      },
    }),
  })
  try {
    const run = await app.run(`const atLoad = [...(entry.effects() ?? [])]
${load ? 'entry.Route.options.beforeLoad()\n' : ''}await entry.mount(entry.Route.options.component)
return { atLoad, after: entry.effects() ?? [] }`)
    return {
      text: (run.html as string).replace(/<[^>]*>/g, ''),
      ...(run.result as { atLoad: Array<string>; after: Array<string> }),
    }
  } finally {
    await app.dispose()
  }
}

const route = (decls: string, options: string) =>
  `${head}import { track } from '../track'
${decls}
export const Route = createFileRoute('/')({
${options}
})
`

describe.each(['vite', 'rspack'] as const)('a %s build', (bundler) => {
  test.each([
    [
      'an object literal',
      "const log = { push(x: string) { track(x) } }\nlog.push('first')",
    ],
    [
      'a class',
      "class Reg { static add(x: string) { track(x) } }\nReg.add('first')",
    ],
    [
      'a function given the method',
      "function Page() { return null }\nPage.set = (x: string) => track(x)\nPage.set('first')",
    ],
  ])(
    'a mutator-named method of %s keeps its order with an effect after it',
    async (_, decls) => {
      const r = await mounted(
        bundler,
        route(
          `${decls}\ntrack('second')`,
          `  component: () => <p>{String(${/(?:const|class|function) (\w+)/.exec(decls)![1]} !== undefined)}</p>,`,
        ),
      )
      expect(r.text).toBe('true')
      expect(r.atLoad).toEqual(['first', 'second'])
    },
    timeout,
  )
})
