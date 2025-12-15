// Test file: Type-only imports should be skipped
import type { UserType } from './types'
import { processUser } from './utils'

export function main(user: UserType) {
  return processUser(user)
}
