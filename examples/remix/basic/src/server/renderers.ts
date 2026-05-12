/**
 * Server functions that render HTML fragments. Same model `createServerFn`
 * gives every Start app: at runtime on the server they execute in-process;
 * at runtime on the client they're replaced by an RPC fetcher that hits
 * `${TSS_SERVER_FN_BASE}/<id>` (default `/_serverFn/<id>`), dispatched by
 * `createStartHandler` via `handleServerAction`.
 *
 * The handler bodies — and the `marked` / `highlight.js` / `heavyDep`
 * graph they pull in — stay out of the client bundle when the
 * `@tanstack/remix-start` Vite plugin runs. Without that plugin the
 * extraction doesn't happen and the bodies ship to the client; that's
 * deferred work, not a property of this code.
 */
import { createServerFn } from '@tanstack/remix-start'
import { renderMarkdown } from './markdown'
import { fetchPost } from './posts'
import {
  TZ_OFFSETS_MAP,
  buildSlug,
  fancyFormat,
  spellNumber,
  summarize,
  topKeywords,
} from './heavyDep'

export const renderPostBody = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const post = await fetchPost(slug)
    if (!post) return null
    return (
      `<article>` +
      `<h2>${escapeHtml(post.title)}</h2>` +
      `<div>${renderMarkdown(post.body)}</div>` +
      `</article>`
    )
  })

export interface UserBioInput {
  id: number
  name: string
  bio: string
}

export const renderUserBio = createServerFn({ method: 'GET' })
  .inputValidator((user: UserBioInput) => user)
  .handler(async ({ data: user }) => {
    const slug = buildSlug(user.name)
    const summary = summarize(user.bio)
    const keywords = topKeywords(user.bio + ' ' + user.name)
    const idInWords = spellNumber(user.id)
    const offset = TZ_OFFSETS_MAP['America/New_York'] ?? 0
    const generatedAt = fancyFormat(new Date(), { locale: 'en-US' })
    void offset

    return (
      `<section>` +
      `<h3>${escapeHtml(user.name)} ` +
      `<small>(#${escapeHtml(idInWords)}, slug: <code>${escapeHtml(slug)}</code>)</small>` +
      `</h3>` +
      `<p>${escapeHtml(summary)}</p>` +
      `<small>Keywords: ${escapeHtml(keywords.join(', '))} • generated at ${escapeHtml(generatedAt)}</small>` +
      `</section>`
    )
  })

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
