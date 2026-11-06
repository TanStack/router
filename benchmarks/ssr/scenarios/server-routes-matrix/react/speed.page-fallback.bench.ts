import { defineShapeBenches } from '../bench'

await defineShapeBenches(
  'page-fallback',
  new URL('./dist/server/server.js', import.meta.url).href,
)
