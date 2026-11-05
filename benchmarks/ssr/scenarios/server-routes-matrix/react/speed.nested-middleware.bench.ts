import { defineShapeBenches } from '../bench'

await defineShapeBenches(
  'nested-middleware',
  new URL('./dist/server/server.js', import.meta.url).href,
)
