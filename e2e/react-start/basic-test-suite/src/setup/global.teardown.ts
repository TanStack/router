import { e2eStopDummyServer } from '@tanstack/router-e2e-utils'
import { getPackageName } from '../utils/getPackageName.ts'

export default async function teardown() {
  try {
    await e2eStopDummyServer(getPackageName())
  } catch {}
}
