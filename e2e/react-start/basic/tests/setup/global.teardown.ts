import { e2eStopDummyServer } from '@tanstack/router-e2e-utils'
import { getPackageName } from '../utils/getPackageName'

export default async function teardown() {
  await e2eStopDummyServer(getPackageName())
}
