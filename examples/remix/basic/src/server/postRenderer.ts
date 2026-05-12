/**
 * Server-only renderer for post bodies. Pulls the markdown source via
 * `fetchPost` and runs it through `renderMarkdown` (marked + highlight.js).
 *
 * This module is only imported behind an `import.meta.env.SSR` guard
 * (see `../lib/renderPost.ts`), so the entire `marked` + `highlight.js`
 * graph stays out of the client bundle. On client navigations the
 * polyglot wrapper fetches `/api/post-body/<slug>` instead, which is
 * served by `server.ts` and runs *this* function on the server.
 */
import { fetchPost } from './posts'
import { renderMarkdown } from './markdown'

export async function renderPostBody(slug: string): Promise<string | null> {
  const post = await fetchPost(slug)
  if (!post) return null
  return (
    `<article>` +
    `<h2>${escapeHtml(post.title)}</h2>` +
    `<div>${renderMarkdown(post.body)}</div>` +
    `</article>`
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
