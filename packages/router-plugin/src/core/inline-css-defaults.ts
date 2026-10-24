/**
 * `TSS_INLINE_CSS_ENABLED` defaults for apps without Start: the router
 * runtime reads the define; the router plugin sets it to `'false'`.
 */
export const INLINE_CSS_DEFAULT_DEFINES = {
  'process.env.TSS_INLINE_CSS_ENABLED': JSON.stringify('false'),
  'import.meta.env.TSS_INLINE_CSS_ENABLED': JSON.stringify('false'),
}
