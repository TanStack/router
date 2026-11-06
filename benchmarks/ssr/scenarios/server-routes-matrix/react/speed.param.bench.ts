import { defineShapeBenches } from '../bench'

await defineShapeBenches(
  'param',
  new URL('./dist/server/server.js', import.meta.url).href,
)
