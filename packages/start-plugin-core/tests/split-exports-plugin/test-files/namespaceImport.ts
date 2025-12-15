// Test file: Namespace imports should be skipped
import * as utils from './utils'

export function main() {
  return utils.foo() + utils.bar()
}
