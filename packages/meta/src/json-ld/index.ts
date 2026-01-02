/**
 * @tanstack/meta/json-ld
 *
 * JSON-LD structured data builders for SEO and rich results.
 *
 * @example
 * ```ts
 * import { jsonLd } from '@tanstack/meta/json-ld'
 *
 * // Add structured data to a product page
 * head: () => ({
 *   meta: [
 *     ...createMeta({ title: 'Product', description: 'Great product' }),
 *     ...jsonLd.product({
 *       name: 'Cool Widget',
 *       price: 99.99,
 *       currency: 'USD',
 *       availability: 'InStock',
 *     }),
 *   ],
 * })
 * ```
 */

export { jsonLd } from './builders'
export { JsonLd } from './types'
export type * from './types'
