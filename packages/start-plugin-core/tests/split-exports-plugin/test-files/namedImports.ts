// Test file: Named imports from relative module
import { foo, bar } from './utils'
import { helper } from '../shared/helpers'

export function main() {
  return foo() + bar() + helper()
}
