import { e2eStopDummyServer } from '@tanstack/router-e2e-utils'
import packageJson from '../../package.json' with { type: 'json' }
import { ssrStylesMode, useNitro } from '../../env'

function getPortKey() {
  let key = packageJson.name
  if (ssrStylesMode !== 'default') {
    key += `-${ssrStylesMode}`
  }
  if (useNitro) {
    key += '-nitro'
  }
  return key
}

export default async function teardown() {
  await e2eStopDummyServer(getPortKey())
}
