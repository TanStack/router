import axios from 'redaxios'
import { DEPLOY_URL } from 'src/utils/users'
import { NotFound } from 'src/components/NotFound'
import { UserErrorComponent } from 'src/components/UserError'
import { createServerFileRoute } from '@tanstack/react-start'
import type { User } from 'src/utils/users'

export const ServerRoute = createServerFileRoute<'/test'>()({
  methods: {
    GET: {
      middleware: [],
      validator: () => {},
      handler: (ctx) => {
        ctx.pathname
        return new Response('Hello')
      },
    },
    // .createGet({
    //   middleware: [],
    // })
    // .handler(async (ctx) => {
    //   ctx.pathname // How do we get the pathname here?
    //   return new Response('Hello')
    // }),
    // PUT: methods.createPut().validator().handler(),
    // POST: function postHandler() {},
  },
})

export const Route = createFileRoute({
  loader: async ({ params: { userId } }) => {
    return await axios
      .get<User>(DEPLOY_URL + '/api/users/' + userId)
      .then((r) => r.data)
      .catch(() => {
        throw new Error('Failed to fetch user')
      })
  },
  errorComponent: UserErrorComponent,
  component: UserComponent,
  notFoundComponent: () => {
    return <NotFound>User not found</NotFound>
  },
})

function UserComponent() {
  const user = Route.useLoaderData()

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{user.name}</h4>
      <div className="text-sm">{user.email}</div>
    </div>
  )
}
