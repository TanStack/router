// Test file: Mixed type and value imports in same declaration
import { type UserType, type Config, processUser, formatData } from './utils'
import { type HelperType, helper } from './helpers'

export function main(user: UserType, config: Config) {
  return processUser(user) + formatData(config) + helper()
}
