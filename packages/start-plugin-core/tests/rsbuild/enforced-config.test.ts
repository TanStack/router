import { stripVTControlCharacters } from 'node:util'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { warnOverriddenConfig } from '../../src/rsbuild/enforced-config'
import type { RsbuildConfig } from '@rsbuild/core'

const frameworkDefine = {
  'process.env.TSS_SERVER_FN_BASE': '"/_serverFn/"',
}

const resolvedConfig: RsbuildConfig = {
  source: {
    define: frameworkDefine,
  },
  server: {
    compress: false,
    htmlFallback: false,
  },
  environments: {
    client: {
      source: {
        define: frameworkDefine,
        entry: {
          index: {
            import: '/app/client.tsx',
            html: false,
          },
        },
      },
      output: {
        target: 'web',
        module: true,
      },
    },
    ssr: {
      source: {
        define: frameworkDefine,
        entry: {
          index: {
            import: '/app/server.ts',
            html: false,
          },
        },
      },
      output: {
        target: 'node',
      },
    },
    provider: {
      source: {
        define: frameworkDefine,
        entry: {
          index: {
            import: 'C:/app/src/server.ts',
            html: false,
          },
        },
      },
      output: {
        target: 'node',
      },
    },
  },
}

const environmentNames = {
  clientEnvironmentName: 'client',
  serverEnvironmentName: 'ssr',
  providerEnvironmentName: 'provider',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('warnOverriddenConfig', () => {
  test('prints all overridden paths in one warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    warnOverriddenConfig({
      originalConfig: {
        source: {
          define: {
            'process.env.TSS_SERVER_FN_BASE': '"/custom/"',
          },
        },
        server: {
          base: '/app/',
          compress: true,
          htmlFallback: 'index',
        },
        output: {
          assetPrefix: 'https://cdn.example.com/',
        },
        environments: {
          client: {
            source: {
              define: {
                'process.env.TSS_SERVER_FN_BASE': '"/client-custom/"',
              },
              entry: {
                index: './src/custom-client.tsx',
              },
            },
            output: {
              target: 'node',
              module: false,
            },
          },
          provider: {
            source: {
              entry: {
                index: './src/custom-provider.ts',
              },
            },
            output: {
              target: 'web',
            },
          },
        },
      },
      resolvedConfig,
      ...environmentNames,
    })

    expect(error).toHaveBeenCalledOnce()
    expect(
      stripVTControlCharacters(error.mock.calls[0]![0]),
    ).toMatchInlineSnapshot(`
      "The following Rsbuild config options will be overridden by TanStack Start:
        - source.define.process.env.TSS_SERVER_FN_BASE
        - server.compress
        - server.htmlFallback
        - environments.client.source.define.process.env.TSS_SERVER_FN_BASE
        - environments.client.source.entry.index
        - environments.client.output.target
        - environments.provider.source.entry.index
        - environments.provider.output.target"
    `)
  })

  test('does not print compatible or user-owned config', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    warnOverriddenConfig({
      originalConfig: {
        server: {
          base: '/app/',
          compress: false,
          htmlFallback: false,
        },
        dev: {
          assetPrefix: '/dev-assets/',
        },
        output: {
          assetPrefix: 'https://cdn.example.com/',
        },
        environments: {
          client: {
            source: resolvedConfig.environments!.client!.source,
            output: {
              target: 'web',
              module: true,
              assetPrefix: '/client-assets/',
            },
          },
          provider: {
            source: {
              entry: {
                index: {
                  import: 'C:\\app\\src\\server.ts',
                  html: false,
                },
              },
            },
            output: {
              target: 'node',
              module: true,
            },
          },
        },
      },
      resolvedConfig,
      ...environmentNames,
    })

    expect(error).not.toHaveBeenCalled()
  })
})
