// Test file: Imports with existing query string
import { foo } from './utils?v=123'
import { bar } from './helpers'

export function main() {
  return foo() + bar()
}
