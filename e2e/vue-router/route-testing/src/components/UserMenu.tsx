import { defineComponent } from 'vue'
import { Link, getRouteApi } from '@tanstack/vue-router'

const authedRoute = getRouteApi('/_authed')

export const UserMenu = defineComponent({
  setup() {
    const context = authedRoute.useRouteContext()
    const data = authedRoute.useLoaderData()

    return () => (
      <div aria-label="User menu">
        <span>{context.value.user.name}</span>
        <span>{data.value.unreadCount} unread</span>
        <Link to="/login">Sign out</Link>
      </div>
    )
  },
})
