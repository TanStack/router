import { ErrorComponent, createFileRoute } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { NotFound } from '~/components/NotFound'
import {
  gql,
  TypedDocumentNode,
  useSuspenseQuery,
} from '@apollo/client/index.js'

export const Route = createFileRoute('/users/$userId')({
  errorComponent: UserErrorComponent,
  component: UserComponent,
  notFoundComponent: () => {
    return <NotFound>User not found</NotFound>
  },
})

const USER_QUERY: TypedDocumentNode<
  {
    user: {
      id: string
      name: string
      email: string
    }
  },
  { id: string }
> = gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
`

export function UserErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}

function UserComponent() {
  const id = Route.useParams().userId
  const user = useSuspenseQuery(USER_QUERY, { variables: { id } }).data.user
  console.log({ user })

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{user.name}</h4>
      <div className="text-sm">{user.email}</div>
    </div>
  )
}
