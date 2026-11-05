import { defineShapeBenches } from '../bench'

await defineShapeBenches(
  'many-routes',
  new URL('./dist/server/server.js', import.meta.url).href,
)
