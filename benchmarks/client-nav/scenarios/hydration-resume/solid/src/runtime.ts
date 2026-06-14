import {
  createHydrationResumeRuntime,
  getDashboardHydrationFixture,
} from '../../shared.ts'

export const hydrationResumeRuntime = createHydrationResumeRuntime()

export function getDashboardFixture() {
  return getDashboardHydrationFixture(hydrationResumeRuntime)
}
