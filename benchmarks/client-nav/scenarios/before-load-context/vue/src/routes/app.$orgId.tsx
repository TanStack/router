import * as Vue from 'vue'
import { Outlet, createFileRoute } from '@tanstack/vue-router'
import {
  consumeSelectedValue,
  deriveOrgContext,
  runContextComputation,
} from '../../../shared'

const OrgLayout = Vue.defineComponent({
  setup() {
    const value = Route.useRouteContext({
      select: (context) =>
        runContextComputation(
          context.orgChecksum,
          context.orgPermissions[0],
          10,
        ),
    })

    return () => {
      consumeSelectedValue(value.value, 'org-context-subscriber')
      return <Outlet />
    }
  },
})

export const Route = createFileRoute('/app/$orgId')({
  beforeLoad: ({ context, params }) => deriveOrgContext(context, params.orgId),
  component: OrgLayout,
})
