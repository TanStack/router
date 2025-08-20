import { makeSerovalPlugin } from '@tanstack/router-core'
import { getDefaultSerovalPlugins } from './getDefaultSerovalPlugins'
import { ServerFunctionSerializationAdapter } from './ServerFunctionSerializationAdapter'

export function getClientSerovalPlugins() {
  return [
    ...getDefaultSerovalPlugins(),
    makeSerovalPlugin(ServerFunctionSerializationAdapter),
  ]
}
