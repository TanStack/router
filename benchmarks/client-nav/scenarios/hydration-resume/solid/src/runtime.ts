import { createHydrationResumeRuntime } from '../../shared.ts'

export const hydrationResumeRuntime = createHydrationResumeRuntime()

export function getDashboardFixture() {
  const fixture = hydrationResumeRuntime.getActiveFixture()

  if (fixture.kind !== 'dashboard') {
    throw new Error('Expected dashboard hydration fixture')
  }

  return fixture
}
