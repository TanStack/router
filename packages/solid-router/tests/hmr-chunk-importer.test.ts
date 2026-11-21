/**
 * The temporary workaround of Rspack's lazy compilation (`hmr-chunk-importer.ts`):
 * the importer of a split chunk answers the chunk's newest evaluation. That
 * an edit reaches a real page through it: router-plugin
 * `integration/route-hmr-browser-solid-identity-rsbuild.test.ts`.
 */
import { describe, expect, test } from 'vitest'
import { __tsrChunkImporter, __tsrRouteChunkHmr } from '../src/hmr'

describe('__tsrChunkImporter (dev-only, webpack-style split chunks)', () => {
  test('answers the exports of the newest evaluation the chunk handed over', async () => {
    const first = { component: 'v1' }
    let evaluated = false
    // the chunk evaluates on its first import; every import answers that
    // first evaluation (Rspack's lazy compilation)
    const importer = __tsrChunkImporter('/newest', 'component~loader', () => {
      if (!evaluated) {
        evaluated = true
        __tsrRouteChunkHmr('/newest', 'component~loader', first, true)
      }
      return Promise.resolve(first)
    })
    expect(await importer()).toBe(first)
    const second = { component: 'v2' }
    __tsrRouteChunkHmr('/newest', 'component~loader', second, true)
    expect(await importer()).toBe(second)
    // another chunk of the route, another route's chunk of the same group
    __tsrRouteChunkHmr('/newest', 'component', { component: 'other' }, false)
    __tsrRouteChunkHmr('/other', 'component~loader', { component: 'x' }, true)
    expect(await importer()).toBe(second)
  })

  test("a chunk that handed nothing over: the import's own answer; a failed import fails", async () => {
    const module = { component: 'v1' }
    expect(
      await __tsrChunkImporter('/none', 'component', () =>
        Promise.resolve(module),
      )(),
    ).toBe(module)
    const error = new Error('boom')
    await expect(
      __tsrChunkImporter('/none', 'component', () => Promise.reject(error))(),
    ).rejects.toBe(error)
  })
})
