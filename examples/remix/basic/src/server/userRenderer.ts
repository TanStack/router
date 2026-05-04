/**
 * Server-only renderer for user bios. Demonstrates the same env-gated
 * pattern as `postRenderer.ts`, but the heavy server dep is the
 * deliberately-fat `heavyDep` module (~2 KB of constants + per-request
 * formatting work) that should never reach the client bundle.
 */
import {
  TZ_OFFSETS_MAP,
  buildSlug,
  fancyFormat,
  spellNumber,
  summarize,
  topKeywords,
} from './heavyDep'

export interface UserBioInput {
  id: number
  name: string
  bio: string
}

export function renderUserBio(user: UserBioInput): string {
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
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
