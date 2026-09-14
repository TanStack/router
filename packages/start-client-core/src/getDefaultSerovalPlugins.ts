import { getStartOptions } from './getStartOptions'
import { createSerovalPlugins } from './createSerovalPlugins'

export function getDefaultSerovalPlugins() {
  return createSerovalPlugins(getStartOptions()?.serializationAdapters)
}
