import * as settings from '@route-modules/settings/scope'
import { orgSettings } from './routeScope.gen'

// Built once, outside any installation: always the Acme organization's members.
const deferredMembers = settings.linkOptions(
  orgSettings.linkOptions({ to: '/members', params: { orgId: 'acme' } }),
)

export function ProfileLinks() {
  const organizationProfile = orgSettings.useMatch({
    from: '@route-modules/settings:/profile',
    shouldThrow: false,
  })
  // The host owns its installation namespace; the provider renders this slot
  // inside the profile match so the local receiver has a real nearest scope.
  return organizationProfile ? (
    <settings.Link {...deferredMembers}>Acme members</settings.Link>
  ) : null
}
