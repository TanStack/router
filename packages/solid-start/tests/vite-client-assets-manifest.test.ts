// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { tanstackStart } from '../src/plugin/vite'

function findClientAssetsPlugin() {
  const plugins = tanstackStart().flat()
  const plugin = plugins.find(
    (item): item is Extract<typeof item, { name?: string }> =>
      Boolean(
        item &&
        typeof item === 'object' &&
        'name' in item &&
        item.name === 'tanstack-solid-start:client-assets-manifest',
      ),
  )
  if (!plugin || typeof plugin.load !== 'function') {
    throw new Error(
      'Expected tanstack-solid-start:client-assets-manifest plugin with load hook',
    )
  }
  return plugin
}

async function evaluateClientAssetsManifest(options: {
  inlineCssEnabled: boolean
  solidManifest: Record<string, unknown>
  startManifest: Record<string, unknown>
}) {
  const plugin = findClientAssetsPlugin()
  const load = plugin.load as (
    this: {
      environment: { name: string }
      resolve: (source: string) => Promise<{ id: string } | null>
    },
    id: string,
  ) => Promise<string | undefined>

  const code = await load.call(
    {
      environment: { name: 'ssr' },
      resolve: async (source: string) => {
        if (
          source === 'virtual:solid-manifest' ||
          source === 'tanstack-start-manifest:v'
        ) {
          return { id: source }
        }
        return null
      },
    },
    '/repo/packages/solid-router/src/ssr/clientAssetsManifest.ts',
  )

  if (!code) {
    throw new Error('Expected plugin load to return module code')
  }

  const transformed = code
    .replace(
      "import manifest from 'virtual:solid-manifest'",
      'const manifest = __solidManifest',
    )
    .replace(
      "import { tsrStartManifest } from 'tanstack-start-manifest:v'",
      'const tsrStartManifest = () => __startManifest',
    )
    .replace(
      /process\.env\.TSS_INLINE_CSS_ENABLED/g,
      JSON.stringify(options.inlineCssEnabled ? 'true' : 'false'),
    )
    .replace(
      'export default clientAssetsManifest',
      'return clientAssetsManifest',
    )

  const factory = new Function(
    '__solidManifest',
    '__startManifest',
    transformed,
  ) as (
    solidManifest: Record<string, unknown>,
    startManifest: Record<string, unknown>,
  ) => Record<string, Record<string, unknown> | string>

  return factory(options.solidManifest, options.startManifest)
}

describe('tanstack-solid-start:client-assets-manifest', () => {
  test('strips inlined CSS entries when inlineCss is enabled while keeping non-inlined CSS', async () => {
    const result = await evaluateClientAssetsManifest({
      inlineCssEnabled: true,
      solidManifest: {
        _base: '/',
        'src/entry-client.tsx': {
          file: 'assets/entry.js',
          isEntry: true,
          css: ['assets/root.css'],
        },
        'src/routes/style.tsx': {
          file: 'assets/style.js',
          isDynamicEntry: true,
          css: ['assets/style.css', 'assets/widget-lazy.css'],
        },
      },
      startManifest: {
        inlineCss: {
          styles: {
            '/assets/root.css': 'body{margin:0}',
            '/assets/style.css': '.repro-marker{color:#0c2238}',
          },
        },
        routes: {},
      },
    })

    expect(result['src/entry-client.tsx']).toEqual({
      file: 'assets/entry.js',
      isEntry: false,
      css: [],
    })
    expect(result['src/routes/style.tsx']).toEqual({
      file: 'assets/style.js',
      isDynamicEntry: true,
      css: ['assets/widget-lazy.css'],
    })
  })

  test('respects custom base path when filtering inlined CSS entries', async () => {
    const result = await evaluateClientAssetsManifest({
      inlineCssEnabled: true,
      solidManifest: {
        _base: '/app',
        'src/routes/style.tsx': {
          file: 'assets/style.js',
          css: ['assets/style.css'],
        },
      },
      startManifest: {
        inlineCss: {
          styles: {
            '/app/assets/style.css': '.repro-marker{color:#0c2238}',
          },
        },
        routes: {},
      },
    })

    expect(result['src/routes/style.tsx']).toEqual({
      file: 'assets/style.js',
      css: [],
    })
  })

  test('preserves CSS entries when inlineCss is disabled', async () => {
    const result = await evaluateClientAssetsManifest({
      inlineCssEnabled: false,
      solidManifest: {
        _base: '/',
        'src/routes/style.tsx': {
          file: 'assets/style.js',
          isDynamicEntry: true,
          css: ['assets/style.css'],
        },
      },
      startManifest: {
        routes: {},
      },
    })

    expect(result['src/routes/style.tsx']).toEqual({
      file: 'assets/style.js',
      isDynamicEntry: true,
      css: ['assets/style.css'],
    })
  })
})
