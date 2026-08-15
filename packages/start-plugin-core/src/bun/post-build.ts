import { pathToFileURL } from 'node:url'
import { join } from 'pathe'
import { postBuild } from '../post-build'
import { prerender } from '../prerender'
import type { TanStackStartOutputConfig } from '../schema'

/**
 * Post-build prerender/sitemap for Bun adapter.
 * Imports the built server entry and uses its `default.fetch` as the request handler.
 *
 * When Nitro bridge is enabled, call this **after** Nitro so
 * `clientOutDir` / `TSS_CLIENT_OUTPUT_DIR` point at the final public dir
 * (e.g. `.output/public`), matching Vite + Nitro (#6940).
 */
export async function postBuildWithBun(opts: {
  startConfig: TanStackStartOutputConfig
  serverOutDir: string
  clientOutDir: string
}): Promise<void> {
  const serverEntry = join(opts.serverOutDir, 'server.js')

  process.env.TSS_PRERENDERING = 'true'
  process.env.TSS_CLIENT_OUTPUT_DIR = opts.clientOutDir

  await postBuild({
    startConfig: opts.startConfig,
    adapter: {
      getClientOutputDirectory: () => opts.clientOutDir,
      prerender: async (startConfig) => {
        const mod = (await import(pathToFileURL(serverEntry).href)) as {
          default?: { fetch?: (req: Request) => Response | Promise<Response> }
        }
        const fetchHandler = mod.default?.fetch
        if (!fetchHandler) {
          throw new Error(
            `[tanstack-start-bun] Server entry ${serverEntry} missing default.fetch`,
          )
        }

        await prerender({
          startConfig,
          handler: {
            getClientOutputDirectory: () => opts.clientOutDir,
            request: async (path, init) => {
              const url = path.startsWith('http')
                ? path
                : `http://localhost${path.startsWith('/') ? path : `/${path}`}`
              return fetchHandler(new Request(url, init))
            },
          },
        })
      },
    },
  })
}
