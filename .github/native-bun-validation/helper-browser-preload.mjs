import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
const root =
  process.env.ROUTER_REPOSITORY_ROOT ??
  fileURLToPath(new URL('../../../', import.meta.url))
await import(
  pathToFileURL(
    path.join(
      root,
      'packages/router-plugin/.cache/helper-browser-override.mjs',
    ),
  ).href
)
await import(
  pathToFileURL(
    path.join(
      root,
      'packages/router-generator/.cache/helper-browser-override.mjs',
    ),
  ).href
)
