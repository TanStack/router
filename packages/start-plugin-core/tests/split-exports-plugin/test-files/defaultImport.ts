// Test file: Default import from relative module
import utils from './utils'
import config from '../config'

export function main() {
  return utils.process(config)
}
