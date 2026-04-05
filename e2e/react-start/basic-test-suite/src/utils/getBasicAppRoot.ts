import { join } from 'node:path'
import { getPackageName } from './getPackageName.ts'

export function getBasicAppRoot() {
  return getPackageName() === 'tanstack-react-start-e2e-basic'
    ? process.cwd()
    : join(process.cwd(), '../basic')
}
