import { isPrerender } from './tests/utils/isPrerender'
import { isSpaMode } from './tests/utils/isSpaMode'

export function getStartModeConfig() {
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
              '/specialChars/search',
              '/specialChars/hash',
              '/specialChars/malformed',
              '/users',
            ].some((p) => page.path.includes(p)),
          maxRedirects: 100,
        }
      : undefined,
  }
}
