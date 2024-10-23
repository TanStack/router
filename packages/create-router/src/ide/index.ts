import { apply as applyVsCode } from './vscode'
import type { Ide } from '../constants'
import type { ApplyParams } from '../types'

export function apply(ide: Ide, params: ApplyParams) {
  switch (ide) {
    case 'vscode':
    case 'cursor':
      return applyVsCode(params)
    case 'other':
      return
  }
}

export function openProject(ide: Ide, params: ApplyParams) {
  switch (ide) {
    case 'vscode':
    case 'cursor': // since cursor is a fork of vscode, we can use the same implementation
      return applyVsCode(params)
    case 'other':
      return
  }
}
