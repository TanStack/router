// Server-only module: it imports a Node built-in. The stripping-marker route
// uses it only inside `dehydrate`, which the client build deletes, so
// this module and its literal must not appear in any client JS asset.
import { createHash } from 'node:crypto'

export const SERVER_ONLY_MODULE_ID = 'TSR_E2E_SERVER_ONLY_MODULE'

export function digestMarker(value: string): string {
  return createHash('sha256')
    .update(`${SERVER_ONLY_MODULE_ID}:${value}`)
    .digest('hex')
    .slice(0, 16)
}
