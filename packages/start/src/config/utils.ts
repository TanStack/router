import { join } from 'node:path/posix'

export function getTanStackStartHiddenFolder(root: string) {
  return join(root, '.tanstack')
}
