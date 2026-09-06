import { expect, test, vi } from 'vitest'
import { DEV_CLIENT_ENTRY } from '../../src/constants'
import { resolveViteId } from '../../src/utils'
import { createDevClientEntryPlugin } from '../../src/vite/plugins'
import type { Plugin } from 'vite'

test.each(['react', 'solid', 'vue'] as const)(
  '%s client startup is retained for its hydration side effects',
  async (framework) => {
    const entry = '/app/client.tsx'
    const plugin = createDevClientEntryPlugin({
      framework,
      getClientEntry: () => entry,
    }) as Plugin
    const load =
      typeof plugin.load === 'function' ? plugin.load : plugin.load?.handler
    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : plugin.transform?.handler
    if (!load || !transform) {
      throw new Error('Expected client entry load and transform hooks')
    }

    const context = {
      environment: {
        config: {
          command: 'serve',
          isBundled: true,
          consumer: 'client',
          server: { hmr: true },
        },
      },
      resolve: vi.fn(async (id: string) => ({ id })),
    }
    await Reflect.apply(load, context, [resolveViteId(DEV_CLIENT_ENTRY)])

    expect(
      Reflect.apply(transform, context, ['hydrateRoot(document)', entry]),
    ).toEqual({
      code: 'hydrateRoot(document)',
      map: null,
      moduleSideEffects: true,
    })
    expect(
      Reflect.apply(transform, context, [
        'export const value = 1',
        '/other.ts',
      ]),
    ).toBeUndefined()

    context.environment.config.isBundled = false
    expect(
      Reflect.apply(transform, context, ['hydrateRoot(document)', entry]),
    ).toBeUndefined()

    context.environment.config.isBundled = true
    context.environment.config.command = 'build'
    expect(
      Reflect.apply(transform, context, ['hydrateRoot(document)', entry]),
    ).toBeUndefined()
  },
)
