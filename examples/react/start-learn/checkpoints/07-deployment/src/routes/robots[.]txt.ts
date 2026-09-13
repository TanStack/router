import { createFileRoute } from '@tanstack/react-router'
import { siteOrigin } from '../server/site.server'
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () =>
        new Response(
          `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.txt\n`,
          {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          },
        ),
    },
  },
})
