import { isPrerender } from './tests/utils/isPrerender'
import { isSpaMode } from './tests/utils/isSpaMode'

const rsbuildClientOutput: 'module' | 'iife' | undefined = (() => {
  const output = process.env.TSS_RSB_CLIENT_OUTPUT

  if (output === undefined) return undefined
  if (output === 'module') return 'module'
  if (output === 'iife') return 'iife'

  throw new Error(
    `Invalid TSS_RSB_CLIENT_OUTPUT: ${output}. Expected "module" or "iife".`,
  )
})()

export function getStartModeConfig() {
  if (process.env.E2E_PRERENDER_CRAWL_ORIGIN) {
    return {
      pages: [{ path: '/crawl-boundaries/seed' }],
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: true,
        concurrency: 1,
        retryCount: 0,
        failOnError: false,
      },
    }
  }

  return {
    spa: isSpaMode
      ? {
          enabled: true,
          prerender: {
            outputPath: 'index.html',
          },
        }
      : undefined,
    prerender: isPrerender
      ? {
          enabled: true,
          filter: (page: { path: string }) =>
            ![
              '/this-route-does-not-exist',
              '/redirect',
              '/i-do-not-exist',
              '/not-found',
              '/primitive-beforeload-error',
              '/specialChars/search',
              '/specialChars/hash',
              '/specialChars/malformed',
              '/users',
            ].some((p) => page.path.includes(p)),
          maxRedirects: 100,
        }
      : undefined,
    rsbuild: rsbuildClientOutput
      ? {
          client: {
            output: rsbuildClientOutput,
          },
        }
      : undefined,
  }
}
