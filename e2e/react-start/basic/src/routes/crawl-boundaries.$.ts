import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/crawl-boundaries/$')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const page = new URL(request.url).pathname
          .split('/')
          .filter(Boolean)
          .at(-1)
        const origin = process.env.E2E_PRERENDER_CRAWL_ORIGIN
        const links =
          page === 'seed' && origin
            ? `<a href="/crawl-boundaries/safe">safe</a>
             <a href="/../../crawl-boundaries/escaped">traversal</a>
             <a href="//${new URL(origin).host}/external">external</a>
             <a href="/%2F%2F${new URL(origin).host}/encoded">encoded</a>`
            : ''
        return new Response(
          `<html><body>crawl-boundaries:${page}${links}</body></html>`,
          {
            headers: { 'content-type': 'text/html' },
          },
        )
      },
    },
  },
})
