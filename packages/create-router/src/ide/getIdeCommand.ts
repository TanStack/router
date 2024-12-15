import type { Ide } from '../constants'

export function getIdeCommand(ide: Ide) {
  switch (ide) {
    case 'vscode':
      return 'code'
    case 'cursor':
      return 'cursor'
    case 'other':
      return
  }
}
