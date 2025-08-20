import { makeSerovalPlugin } from '@tanstack/router-core'
import { getDefaultSerovalPlugins } from '@tanstack/start-client-core'
import { ServerFunctionSerializationAdapter } from './ServerFunctionSerializationAdapter'

export function getSerovalPlugins() {
  return [
    ...getDefaultSerovalPlugins(),
    makeSerovalPlugin(ServerFunctionSerializationAdapter),
  ]
}
