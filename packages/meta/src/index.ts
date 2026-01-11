/**
 * @tanstack/meta
 *
 * Composable, type-safe meta tag utilities for modern web applications.
 *
 * ## Quick Start
 *
 * ```ts
 * import { createMeta } from '@tanstack/meta'
 *
 * // In a TanStack Router route
 * export const Route = createFileRoute('/about')({
 *   head: () => ({
 *     meta: createMeta({
 *       title: 'About Us',
 *       description: 'Learn about our company',
 *       url: 'https://example.com/about',
 *       image: 'https://example.com/about-og.jpg',
 *     }),
 *   }),
 * })
 * ```
 *
 * ## Extending with JSON-LD
 *
 * ```ts
 * import { createMeta } from '@tanstack/meta'
 * import { jsonLd } from '@tanstack/meta/json-ld'
 *
 * head: () => ({
 *   meta: [
 *     ...createMeta({ title: 'Product', description: 'Great product' }),
 *     ...jsonLd.product({ name: 'Product', price: 99.99 }),
 *   ],
 * })
 * ```
 *
 * ## Using Individual Builders
 *
 * ```ts
 * import { meta } from '@tanstack/meta'
 *
 * head: () => ({
 *   meta: [
 *     ...meta.title('My Page'),
 *     ...meta.description('Page description'),
 *     ...meta.robots({ index: true, follow: true }),
 *   ],
 * })
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Primary API
// ─────────────────────────────────────────────────────────────────────────────

export { createMeta } from './createMeta'
export type { CreateMetaConfig } from './createMeta'

// ─────────────────────────────────────────────────────────────────────────────
// Individual Builders
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Builder namespace
  meta,
  // Individual functions for tree-shaking
  title,
  description,
  charset,
  viewport,
  robots,
  canonical,
  alternate,
  openGraph,
  twitter,
  themeColor,
  verification,
} from './builders'

// ─────────────────────────────────────────────────────────────────────────────
// Merge Utilities
// ─────────────────────────────────────────────────────────────────────────────

export { mergeMeta, mergeMetaWith, excludeMeta, pickMeta } from './merge'
export type { MergeStrategy, MergeOptions } from './merge'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
  MetaDescriptor,
  MetaImage,
  RobotsConfig,
  OpenGraphConfig,
  TwitterConfig,
} from './types'
