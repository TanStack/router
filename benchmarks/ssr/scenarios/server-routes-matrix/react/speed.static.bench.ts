import { defineShapeBenches } from '../bench'

await defineShapeBenches(
  'static',
  new URL('./dist/server/server.js', import.meta.url).href,
)
