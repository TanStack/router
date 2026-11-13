/**
 * Known code-splitter bugs. Each test asserts the correct behaviour for a shape a code-splitter bug broke (a regression test).
 *
 * Every route is loaded the way an app loads it (`./route-app`): the public
 * router plugin in a real Vite dev server, and each check run in a real
 * browser page. The modules the route file imports are files of the app;
 * the page reads what they record. The other known code-splitter bugs are in
 * `known-bugs-code-splitter-{shapes,bindings,server}.test.ts`.
 */

import { describe, expect, test } from 'vitest'
import { head, loadRoute } from '../../route-app'

/**
 * `./state`: `init` returns its argument and `register` pushes an item;
 * `calls` counts the calls of both.
 */
const stateFile = `export let calls = 0
export const init = <T>(value: T) => {
  calls++
  return value
}
export const register = (items: Array<string>) => {
  calls++
  items.push('item')
}
`

describe('module state shared with split chunks', () => {
  // Control for loadRoute: a top-level const read by the loader and the split
  // component moves to the shared module and is initialized once.
  test('a const read by the loader and the split component is initialized once', async () => {
    const route = await loadRoute(
      `${head}import { init } from './state'
const value = init(1)
export const Route = createFileRoute('/')({
  loader: () => value,
  component: () => <p>{value}</p>,
  errorComponent: () => <p>error</p>,
})`,
      { files: { 'state.ts': stateFile } },
    )
    // (When the shared initializer runs, with the route module or with the
    // first chunk that needs it, is free: SPEC G3.)
    expect(
      await route.run(`return [
  options.loader(),
  await render('component'),
  await render('errorComponent'),
  (await app('state.ts')).calls,
]`),
    ).toEqual([1, '<p>1</p>', '<p>error</p>', 1])
  })

  /**
   * Loads a route with a component and an errorComponent next to the
   * top-level `effect`, which calls `track` or `subscribe` (`./effects`,
   * which counts the calls), loads both chunks and asserts that the effect
   * ran once, with the route module.
   */
  async function expectEffectRunsOnce(effect: string) {
    const route = await loadRoute(
      `${head}import { subscribe, track } from './effects'
${effect}
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
  errorComponent: () => <p>error</p>,
})`,
      {
        files: {
          'effects.ts': `export let calls = 0
export const track = (..._args: Array<unknown>) => calls++
export const subscribe = (listener: () => unknown) => {
  calls++
  return listener
}
`,
        },
      },
    )
    // Both chunks loaded, and the effect ran once, with the route module.
    expect(
      await route.run(`const effects = await app('effects.ts')
const callsBeforeChunks = effects.calls
const rendered = [await render('component'), await render('errorComponent')]
return [rendered, callsBeforeChunks, effects.calls]`),
    ).toEqual([['<p>index</p>', '<p>error</p>'], 1, 1])
  }

  // A top-level call that reads only imports and literals is stripped from
  // the chunks.
  test.each([
    { name: 'a call reading an import', effect: 'track(subscribe)' },
    { name: 'a call with literal arguments', effect: `track('a', 'b')` },
  ])(
    'an unreferenced top-level side effect ($name) runs once, with the route module',
    async ({ effect }) => {
      await expectEffectRunsOnce(effect)
    },
  )
})
