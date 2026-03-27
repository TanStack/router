import { join } from 'node:path'
import { getPackageName } from './getPackageName.ts'

export function getBasicAppRoot() {
  return getPackageName().endsWith('-basic')
    ? process.cwd()
    : join(process.cwd(), '../basic')
}
