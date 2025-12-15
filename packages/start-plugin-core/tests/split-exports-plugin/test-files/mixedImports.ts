// Test file: Mixed default and named imports
import utils, { foo, bar } from './utils'

export function main() {
  return utils.process() + foo() + bar()
}
