import { defineShapeBenches } from '../bench'

await defineShapeBenches(
  'api-miss',
  new URL('./dist/server/server.js', import.meta.url).href,
)
