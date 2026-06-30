import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import defaultServerEntry, {
  createServerEntry,
} from '@tanstack/react-start/server-entry'
import type { SsrStreamingResolverResult } from '@tanstack/react-start/server'

type SsrStreamingOverride = {
  render?: boolean
  head?: boolean
}

function getStreamingPolicy(request: Request): SsrStreamingResolverResult {
  const url = new URL(request.url)

  switch (url.searchParams.get('streaming')) {
    case 'all':
      return {
        render: true,
        head: true,
      }
    case 'none':
      return {
        render: false,
      }
    case 'render-only':
      return {
        render: true,
      }
    case 'head-only':
      return {
        render: false,
        head: true,
      }
    default:
      return undefined
  }
}

function getStreamingOverride(
  request: Request,
): SsrStreamingOverride | undefined {
  return getStreamingPolicy(request)
}

const handler = createStartHandler({
  handler: defaultStreamHandler,
  ssr: {
    streaming: ({ request }) => getStreamingPolicy(request),
  },
})

export default createServerEntry({
  fetch(request) {
    if (process.env.STREAMING_SSR_ENTRY_FORM === 'default-entry') {
      return defaultServerEntry.fetch(request, {
        ssr: {
          streaming: getStreamingOverride(request),
        },
      } as any)
    }

    return handler(request)
  },
})
